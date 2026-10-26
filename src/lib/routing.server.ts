import { z } from "zod";
import { coordinate } from "./schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  findRideMatches,
  type Coordinates,
  type DriverRoute,
  type RideMatch,
  type WalkingRouteResolver,
} from "./ride-matching";
import { legacyRouteCoordinates, moroccoInstant, tripRunsOnDate } from "./route-adapter";

/** Server-only helpers shared by search, publishing and booking. */

export const pause = () => new Promise((resolve) => setTimeout(resolve, 1100));
export const headers = {
  "User-Agent": "Rafiq-ENSA-Tanger/1.0 (student carpool prototype)",
  Accept: "application/json",
};

const osrmSchema = z.object({
  code: z.literal("Ok"),
  waypoints: z.array(z.object({ location: coordinate, distance: z.number() })),
  routes: z.array(
    z.object({
      distance: z.number(),
      duration: z.number(),
      geometry: z.object({ coordinates: z.array(coordinate) }),
      legs: z.array(
        z.object({
          annotation: z
            .object({ distance: z.array(z.number()), duration: z.array(z.number()) })
            .optional(),
        }),
      ),
    }),
  ),
});

export async function routeRequest(kind: "car" | "foot", from: Coordinates, to: Coordinates) {
  await pause();
  const base =
    kind === "foot"
      ? "https://routing.openstreetmap.de/routed-foot"
      : "https://router.project-osrm.org";
  const response = await fetch(
    `${base}/route/v1/driving/${from.join(",")};${to.join(",")}?overview=full&geometries=geojson&annotations=distance,duration&steps=false`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error("Routing unavailable");
  const parsed = osrmSchema.parse(await response.json());
  const route = parsed.routes[0];
  if (!route) throw new Error("No route");
  return { route, waypoints: parsed.waypoints };
}

export interface TripGeometryRow {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  route: unknown;
}

const cumulative = (values: number[]) => {
  let total = 0;
  return [0, ...values.map((value) => (total += value))];
};

/**
 * Resolve segment metrics only when the provider returns exactly the persisted geometry.
 * Never replace a published driver's path with a newly guessed path.
 */
export async function verifiedGeometry(trip: TripGeometryRow) {
  const coordinates = legacyRouteCoordinates(trip.route);
  const { route } = await routeRequest(
    "car",
    [trip.origin_lng, trip.origin_lat],
    [trip.dest_lng, trip.dest_lat],
  );
  if (
    coordinates.length !== route.geometry.coordinates.length ||
    coordinates.some((value, index) => {
      const other = route.geometry.coordinates[index];
      return (
        !other || Math.abs(value[0] - other[0]) > 0.00001 || Math.abs(value[1] - other[1]) > 0.00001
      );
    })
  )
    return null;
  const annotation = route.legs[0]?.annotation;
  if (
    !annotation ||
    annotation.distance.length !== coordinates.length - 1 ||
    annotation.duration.length !== coordinates.length - 1
  )
    return null;
  return {
    coordinates,
    distanceMeters: cumulative(annotation.distance),
    elapsedSeconds: cumulative(annotation.duration),
  };
}

/** Pedestrian routes are only accepted when both ends snap onto the real path. */
export function walkingResolver(onUnavailable: () => void): WalkingRouteResolver {
  return async (from, to) => {
    try {
      const result = await routeRequest("foot", from, to);
      const startSnap = result.waypoints[0]?.distance ?? Infinity;
      const endSnap = result.waypoints[1]?.distance ?? Infinity;
      // Reject snapped paths that do not reach the actual pickup; never claim a partial path is walkable.
      if (startSnap > 5 || endSnap > 5) return null;
      const extra = startSnap + endSnap;
      return {
        coordinates: result.route.geometry.coordinates,
        distanceMeters: result.route.distance + extra,
        durationSeconds: result.route.duration + extra / 1.2,
      };
    } catch {
      onUnavailable();
      return null;
    }
  };
}

/** First Nominatim result for a place in Tanger, or null. */
export async function geocodeFirst(
  query: string,
): Promise<{ label: string; coordinates: Coordinates } | null> {
  await pause();
  const params = new URLSearchParams({
    q: `${query}, Tanger, Maroc`,
    format: "jsonv2",
    limit: "1",
    countrycodes: "ma",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Geocoding unavailable");
  const [place] = z
    .array(z.object({ display_name: z.string(), lat: z.string(), lon: z.string() }))
    .parse(await response.json());
  if (!place) return null;
  const parsed = coordinate.safeParse([Number(place.lon), Number(place.lat)]);
  return parsed.success ? { label: place.display_name, coordinates: parsed.data } : null;
}

async function getAdminClient(
  fallback: SupabaseClient<Database>,
): Promise<SupabaseClient<Database>> {
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** The one search implementation: used by the search screen and by the assistant. */
export async function searchRides(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: { origin: Coordinates; destination: Coordinates; date: string; arrival: string },
) {
  const empty = {
    matches: [] as RideMatch[],
    routes: [] as { id: string; coordinates: Coordinates[] }[],
    error: null as string | null,
    unavailableCount: 0,
  };
  try {
    const deadline = moroccoInstant(data.date, data.arrival);
    if (deadline <= Date.now())
      return { ...empty, error: "Choisissez une heure d’arrivée future." };
    const db = await getAdminClient(supabase);
    const { data: trips, error } = await db.from("trips").select("*").eq("active", true).limit(50);
    if (error) throw error;
    const candidates = (trips ?? [])
      .filter(
        (trip) =>
          tripRunsOnDate(trip, data.date) &&
          trip.driver_id !== userId &&
          Math.abs(trip.dest_lat - data.destination[1]) < 0.001 &&
          Math.abs(trip.dest_lng - data.destination[0]) < 0.001,
      )
      .slice(0, 8);
    if (candidates.length === 0) return empty;
    const routes: DriverRoute[] = [];
    let unavailableCount = 0;
    for (const trip of candidates) {
      try {
        const geometry = await verifiedGeometry(trip);
        if (!geometry) {
          unavailableCount++;
          continue;
        }
        const { data: profile } = await db
          .from("profiles")
          .select("rating_avg")
          .eq("id", trip.driver_id)
          .maybeSingle();
        // Capacity is rechecked by the booking trigger. Other passengers' rows are not publicly exposed.
        routes.push({
          id: trip.id,
          ...geometry,
          departureTime: moroccoInstant(data.date, trip.departure_time),
          seatsAvailable: trip.seats,
          rating: profile?.rating_avg ?? 0,
        });
      } catch {
        unavailableCount++;
      }
    }
    const matches: RideMatch[] = [];
    // One route at a time respects community pedestrian routing's request interval.
    for (const route of routes) {
      const found = await findRideMatches({
        passengerPosition: data.origin,
        desiredArrivalTime: deadline,
        earliestPickupTime: Date.now(),
        routes: [route],
        resolveWalkingRoute: walkingResolver(() => {
          unavailableCount++;
        }),
      });
      matches.push(...found);
    }
    matches.sort(
      (a, b) =>
        a.walkingRoute.durationSeconds - b.walkingRoute.durationSeconds ||
        a.arrivalTime - b.arrivalTime ||
        b.rating - a.rating,
    );
    return {
      matches,
      routes: routes
        .filter((route) => matches.some((match) => match.tripId === route.id))
        .map((route) => ({ id: route.id, coordinates: route.coordinates })),
      error: null,
      unavailableCount,
    };
  } catch {
    return {
      ...empty,
      error: "Les trajets ne sont pas accessibles pour le moment. Réessayez plus tard.",
    };
  }
}
