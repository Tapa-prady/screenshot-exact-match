export const MIN_PRICE_DH = 5;
export const MAX_PRICE_DH = 20;

/** 2 DH/km up to 5 km, 1 DH/km from 5 to 10 km, 0.5 DH/km beyond; between 5 and 20 DH. Shared by search and booking; distance is the passenger's driven segment. */
export function calculateRidePrice(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError("Distance must be finite and non-negative");
  }
  const total =
    Math.min(distanceKm, 5) * 2 +
    Math.min(Math.max(distanceKm - 5, 0), 5) +
    Math.max(distanceKm - 10, 0) * 0.5;
  return Math.min(MAX_PRICE_DH, Math.max(MIN_PRICE_DH, Math.round(total)));
}
