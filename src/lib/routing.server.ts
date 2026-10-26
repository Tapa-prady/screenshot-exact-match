import { z } from "zod";
import { coordinate } from "./schemas";
import type { Coordinates, WalkingRouteResolver } from "./ride-matching";
import { legacyRouteCoordinates } from "./route-adapter";

/** Server-only helpers shared by search, publishing and booking. */

export const pause = () => new Promise(resolve => setTimeout(resolve, 1100));
export const headers = { "User-Agent": "Rafiq-ENSA-Tanger/1.0 (student carpool prototype)", Accept: "application/json" };

const osrmSchema = z.object({
  code: z.literal("Ok"),
  waypoints: z.array(z.object({ location: coordinate, distance: z.number() })),
  routes: z.array(z.object({
    distance: z.number(), duration: z.number(),
    geometry: z.object({ coordinates: z.array(coordinate) }),
    legs: z.array(z.object({ annotation: z.object({ distance: z.array(z.number()), duration: z.array(z.number()) }).optional() })),
  })),
});

export async function routeRequest(kind: "car" | "foot", from: Coordinates, to: Coordinates) {
  await pause();
  const base = kind === "foot" ? "https://routing.openstreetmap.de/routed-foot" : "https://router.project-osrm.org";
  const response = await fetch(`${base}/route/v1/driving/${from.join(",")};${to.join(",")}?overview=full&geometries=geojson&annotations=distance,duration&steps=false`, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Routing unavailable");
  const parsed = osrmSchema.parse(await response.json());
  const route = parsed.routes[0];
  if (!route) throw new Error("No route");
  return { route, waypoints: parsed.waypoints };
}

export interface TripGeometryRow {
  origin_lat: number; origin_lng: number; dest_lat: number; dest_lng: number; route: unknown;
}

const cumulative = (values: number[]) => { let total = 0; return [0, ...values.map(value => (total += value))]; };

/**
 * Resolve segment metrics only when the provider returns exactly the persisted geometry.
 * Never replace a published driver's path with a newly guessed path.
 */
export async function verifiedGeometry(trip: TripGeometryRow) {
  const coordinates = legacyRouteCoordinates(trip.route);
  const { route } = await routeRequest("car", [trip.origin_lng, trip.origin_lat], [trip.dest_lng, trip.dest_lat]);
  if (coordinates.length !== route.geometry.coordinates.length || coordinates.some((value, index) => {
    const other = route.geometry.coordinates[index];
    return !other || Math.abs(value[0] - other[0]) > 0.00001 || Math.abs(value[1] - other[1]) > 0.00001;
  })) return null;
  const annotation = route.legs[0]?.annotation;
  if (!annotation || annotation.distance.length !== coordinates.length - 1 || annotation.duration.length !== coordinates.length - 1) return null;
  return { coordinates, distanceMeters: cumulative(annotation.distance), elapsedSeconds: cumulative(annotation.duration) };
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
      return { coordinates: result.route.geometry.coordinates, distanceMeters: result.route.distance + extra, durationSeconds: result.route.duration + extra / 1.2 };
    } catch { onUnavailable(); return null; }
  };
}
