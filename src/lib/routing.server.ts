import { z } from "zod";
import { shortAddress } from "./address";
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
  return parsed.success
    ? { label: shortAddress(place.display_name), coordinates: parsed.data }
    : null;
}

/**
 * Ride search must read every driver's trips, which members cannot do themselves.
 * A missing server key must be an error, never a silent "0 trips".
 */
async function getAdminClient(): Promise<SupabaseClient<Database>> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing on the server");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Part of a driver's path from the pickup onwards. The beginning (usually the driver's home)
 * is never sent to passengers.
 */
export function routeFromPickup(coordinates: Coordinates[], pickup: Coordinates): Coordinates[] {
  const distanceToSegment = (from: Coordinates, to: Coordinates) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((pickup[0] - from[0]) * dx + (pickup[1] - from[1]) * dy) / length),
          );
    return (from[0] + t * dx - pickup[0]) ** 2 + (from[1] + t * dy - pickup[1]) ** 2;
  };
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < coordinates.length - 1; index++) {
    const distance = distanceToSegment(
      coordinates[index] as Coordinates,
      coordinates[index + 1] as Coordinates,
    );
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return [pickup, ...coordinates.slice(best + 1)];
}

export interface DriverCard {
  firstName: string;
  rating: number;
  vehicle: string | null;
}

/** The one search implementation: used by the search screen and by the assistant. */
export async function searchRides(
  userId: string,
  data: { origin: Coordinates; destination: Coordinates; date: string; arrival: string },
) {
  const empty = {
    matches: [] as RideMatch[],
    routes: [] as { id: string; coordinates: Coordinates[] }[],
    drivers: {} as Record<string, DriverCard>,
    error: null as string | null,
    /** Why nothing was found, in plain words. */
    hint: null as string | null,
    unavailableCount: 0,
  };
  try {
    const deadline = moroccoInstant(data.date, data.arrival);
    if (deadline <= Date.now())
      return { ...empty, error: "Choisissez une heure d’arrivée future." };
    const db = await getAdminClient();
    const { data: trips, error } = await db.from("trips").select("*").eq("active", true).limit(50);
    if (error) throw error;
    const all = trips ?? [];
    const others = all.filter((trip) => trip.driver_id !== userId);
    const onDate = others.filter((trip) => tripRunsOnDate(trip, data.date));
    // The campus is wide and two people may pick different map points for it: allow about 400 m.
    const candidates = onDate
      .filter(
        (trip) =>
          Math.abs(trip.dest_lat - data.destination[1]) < 0.004 &&
          Math.abs(trip.dest_lng - data.destination[0]) < 0.004,
      )
      .slice(0, 8);
    if (candidates.length === 0) {
      const hint =
        all.length === 0
          ? "Aucun conducteur n’a publié de trajet pour le moment."
          : others.length === 0
            ? "Le seul trajet publié est le vôtre : un conducteur ne le voit pas dans la recherche. Testez avec un autre compte."
            : onDate.length === 0
              ? "Des trajets existent, mais aucun ne circule ce jour-là."
              : "Des trajets existent, mais pas vers cette arrivée. Choisissez la même adresse d’arrivée que le conducteur.";
      return { ...empty, hint };
    }
    const routes: DriverRoute[] = [];
    const drivers: Record<string, DriverCard> = {};
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
          .select("rating_avg, first_name")
          .eq("id", trip.driver_id)
          .maybeSingle();
        const { data: car } = trip.vehicle_id
          ? await db.from("vehicles").select("brand, color").eq("id", trip.vehicle_id).maybeSingle()
          : { data: null };
        drivers[trip.id] = {
          firstName: profile?.first_name || "Conducteur",
          rating: Number(profile?.rating_avg ?? 0),
          vehicle: car ? `${car.brand} ${car.color}` : null,
        };
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
      routes: routes.flatMap((route) => {
        const match = matches.find((item) => item.tripId === route.id);
        return match
          ? [{ id: route.id, coordinates: routeFromPickup(route.coordinates, match.meetingPoint) }]
          : [];
      }),
      drivers,
      error: null,
      hint:
        matches.length === 0 && unavailableCount === 0
          ? `${candidates.length} trajet${candidates.length > 1 ? "s" : ""} vers cette arrivée, mais aucun ne passe à 200 m maximum de votre départ à une heure compatible avec votre arrivée.`
          : null,
      unavailableCount,
    };
  } catch {
    return {
      ...empty,
      error: "Les trajets ne sont pas accessibles pour le moment. Réessayez plus tard.",
    };
  }
}
