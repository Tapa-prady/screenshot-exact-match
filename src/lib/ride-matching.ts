import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import { calculateRidePrice } from "./ride-pricing";

export type Coordinates = [longitude: number, latitude: number];
export interface DriverRoute {
  id: string;
  coordinates: Coordinates[];
  /** Real cumulative route distance and time at each geometry vertex. */
  distanceMeters: number[];
  elapsedSeconds: number[];
  departureTime: number;
  seatsAvailable: number;
  rating: number;
}
export interface WalkingRoute {
  coordinates: Coordinates[];
  distanceMeters: number;
  durationSeconds: number;
}
export interface RideMatch {
  tripId: string;
  meetingPoint: Coordinates;
  walkingRoute: WalkingRoute;
  pickupTime: number;
  arrivalTime: number;
  passengerDistanceKm: number;
  priceDh: number;
  rating: number;
}
export type WalkingRouteResolver = (
  from: Coordinates,
  to: Coordinates,
) => Promise<WalkingRoute | null>;

function validCoordinate(coordinate: Coordinates): boolean {
  return (
    coordinate.length === 2 &&
    coordinate.every(Number.isFinite) &&
    Math.abs(coordinate[0]) <= 180 &&
    Math.abs(coordinate[1]) <= 90
  );
}

function validRoute(route: DriverRoute): boolean {
  const count = route.coordinates.length;
  return (
    count >= 2 &&
    route.coordinates.every(validCoordinate) &&
    route.distanceMeters.length === count &&
    route.elapsedSeconds.length === count &&
    route.distanceMeters[0] === 0 &&
    route.elapsedSeconds[0] === 0 &&
    [route.distanceMeters, route.elapsedSeconds].every((values) =>
      values.every(
        (value, index) =>
          Number.isFinite(value) &&
          value >= 0 &&
          (index === 0 || value >= (values[index - 1] ?? 0)),
      ),
    ) &&
    Number.isFinite(route.departureTime) &&
    Number.isFinite(route.rating)
  );
}

/** Never treat straight-line proximity as a confirmed walkable pickup. */
export async function findRideMatches(input: {
  passengerPosition: Coordinates;
  desiredArrivalTime: number;
  earliestPickupTime: number;
  routes: DriverRoute[];
  resolveWalkingRoute: WalkingRouteResolver;
}): Promise<RideMatch[]> {
  if (
    !validCoordinate(input.passengerPosition) ||
    !Number.isFinite(input.desiredArrivalTime) ||
    !Number.isFinite(input.earliestPickupTime)
  )
    throw new RangeError("Invalid search");

  const matches = await Promise.all(
    input.routes.map(async (route) => {
      if (!validRoute(route) || route.seatsAvailable < 1) return null;
      const nearest = nearestPointOnLine(
        lineString(route.coordinates),
        point(input.passengerPosition),
        { units: "meters" },
      );
      if (nearest.properties.dist > 200) return null;
      const segment = Math.min(nearest.properties.index, route.coordinates.length - 2);
      const start = route.coordinates[segment];
      const end = route.coordinates[segment + 1];
      if (!start || !end) return null;
      const segmentLength = nearestPointOnLine(lineString([start, end]), point(end), {
        units: "meters",
      }).properties.location;
      const localDistance = nearestPointOnLine(lineString([start, end]), nearest, {
        units: "meters",
      }).properties.location;
      const fraction =
        segmentLength > 0 ? Math.min(1, Math.max(0, localDistance / segmentLength)) : 0;
      const interpolate = (values: number[]) =>
        (values[segment] ?? 0) + fraction * ((values[segment + 1] ?? 0) - (values[segment] ?? 0));
      const pickupTime = route.departureTime + interpolate(route.elapsedSeconds) * 1000;
      const arrivalTime = route.departureTime + (route.elapsedSeconds.at(-1) ?? 0) * 1000;
      const passengerDistanceKm =
        ((route.distanceMeters.at(-1) ?? 0) - interpolate(route.distanceMeters)) / 1000;
      if (arrivalTime > input.desiredArrivalTime || passengerDistanceKm <= 0) return null;
      const meetingPoint = nearest.geometry.coordinates as Coordinates;
      const walkingRoute = await input.resolveWalkingRoute(input.passengerPosition, meetingPoint);
      if (
        !walkingRoute ||
        !Number.isFinite(walkingRoute.distanceMeters) ||
        !Number.isFinite(walkingRoute.durationSeconds) ||
        walkingRoute.distanceMeters < 0 ||
        walkingRoute.durationSeconds < 0 ||
        walkingRoute.distanceMeters > 200 ||
        walkingRoute.durationSeconds >= 300 ||
        walkingRoute.coordinates.length < 2 ||
        !walkingRoute.coordinates.every(validCoordinate) ||
        input.earliestPickupTime + walkingRoute.durationSeconds * 1000 > pickupTime
      )
        return null;
      return {
        tripId: route.id,
        meetingPoint,
        walkingRoute,
        pickupTime,
        arrivalTime,
        passengerDistanceKm,
        priceDh: calculateRidePrice(passengerDistanceKm),
        rating: route.rating,
      };
    }),
  );
  return matches
    .filter((match): match is RideMatch => match !== null)
    .sort(
      (a, b) =>
        a.walkingRoute.durationSeconds - b.walkingRoute.durationSeconds ||
        a.arrivalTime - b.arrivalTime ||
        b.rating - a.rating,
    );
}
