/** Shared by search and booking; distance is the passenger's driven segment. */
export function calculateRidePrice(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError("Distance must be finite and non-negative");
  }
  const total =
    Math.min(distanceKm, 5) * 3 +
    Math.min(Math.max(distanceKm - 5, 0), 5) +
    Math.max(distanceKm - 10, 0) * 0.5;
  return Math.min(25, Math.max(7, Math.round(total)));
}
