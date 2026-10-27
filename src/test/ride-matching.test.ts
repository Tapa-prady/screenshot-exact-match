import { describe, expect, it } from "vitest";
import { findRideMatches, type DriverRoute, type WalkingRouteResolver } from "@/lib/ride-matching";

const route: DriverRoute = {
  id: "driver",
  coordinates: [
    [-5.8, 35.7],
    [-5.7, 35.7],
  ],
  distanceMeters: [0, 20000],
  elapsedSeconds: [0, 1800],
  departureTime: Date.UTC(2026, 9, 26, 7),
  seatsAvailable: 2,
  rating: 4.9,
};
const walk: WalkingRouteResolver = async (from, to) => ({
  coordinates: [from, to],
  distanceMeters: 100,
  durationSeconds: 90,
});
const search = (changes: Partial<Parameters<typeof findRideMatches>[0]> = {}) =>
  findRideMatches({
    passengerPosition: [-5.75, 35.7005],
    routes: [route],
    desiredArrivalTime: Date.UTC(2026, 9, 26, 8),
    earliestPickupTime: Date.UTC(2026, 9, 26, 6, 55),
    resolveWalkingRoute: walk,
    ...changes,
  });

describe("On-route meeting points", () => {
  it("places the pickup on the driver's unmodified route and prices only the remaining segment", async () => {
    const before = structuredClone(route.coordinates);
    const [match] = await search();
    expect(match).toBeDefined();
    expect(match?.meetingPoint[0]).toBeCloseTo(-5.75, 4);
    expect(match?.meetingPoint[1]).toBeCloseTo(35.7, 4);
    expect(match?.passengerDistanceKm).toBeCloseTo(10, 1);
    expect(match?.priceDh).toBe(15);
    expect(route.coordinates).toEqual(before);
  });
  it("accepts a verified pedestrian route of exactly 200 m", async () => {
    expect(
      await search({
        resolveWalkingRoute: async (from, to) => ({
          coordinates: [from, to],
          distanceMeters: 200,
          durationSeconds: 240,
        }),
      }),
    ).toHaveLength(1);
  });
  it("rejects a walk beyond 200 m even when the straight-line point is nearby", async () => {
    expect(
      await search({
        resolveWalkingRoute: async (from, to) => ({
          coordinates: [from, to],
          distanceMeters: 201,
          durationSeconds: 240,
        }),
      }),
    ).toEqual([]);
  });
  it("requires walking time strictly below five minutes", async () => {
    expect(
      await search({
        resolveWalkingRoute: async (from, to) => ({
          coordinates: [from, to],
          distanceMeters: 180,
          durationSeconds: 300,
        }),
      }),
    ).toEqual([]);
  });
  it("does not invent a walkable path when routing is unavailable", async () => {
    expect(await search({ resolveWalkingRoute: async () => null })).toEqual([]);
  });
  it("rejects arrivals after the passenger's deadline", async () => {
    expect(await search({ desiredArrivalTime: Date.UTC(2026, 9, 26, 7, 29) })).toEqual([]);
  });
  it("rejects pickup times that leave insufficient time to walk", async () => {
    expect(await search({ earliestPickupTime: Date.UTC(2026, 9, 26, 7, 15) })).toEqual([]);
  });
  it("excludes trips without a remaining seat", async () => {
    expect(await search({ routes: [{ ...route, seatsAvailable: 0 }] })).toEqual([]);
  });
  it("ranks walking time, then arrival time, then rating", async () => {
    const ranked = await search({
      routes: [
        { ...route, id: "lower", rating: 4 },
        { ...route, id: "later", departureTime: route.departureTime + 60000, rating: 5 },
        { ...route, id: "best" },
      ],
    });
    expect(ranked.map((match) => match.tripId)).toEqual(["best", "lower", "later"]);
  });
});
