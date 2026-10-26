import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifiedGeometry, walkingResolver } from "@/lib/routing.server";
import { legacyRouteCoordinates } from "@/lib/route-adapter";

const geometry: [number, number][] = [
  [-5.8, 35.7],
  [-5.79, 35.71],
  [-5.78, 35.72],
];
// Persisted trips store [lat, lng]; the provider answers [lng, lat].
const stored = geometry.map(([lng, lat]) => [lat, lng]);
const trip = {
  origin_lng: -5.8,
  origin_lat: 35.7,
  dest_lng: -5.78,
  dest_lat: 35.72,
  route: stored,
};

function osrm(overrides: Record<string, unknown> = {}, waypointDistance = 1) {
  return {
    code: "Ok",
    waypoints: [
      { location: geometry[0], distance: waypointDistance },
      { location: geometry[2], distance: waypointDistance },
    ],
    routes: [
      {
        distance: 300,
        duration: 30,
        geometry: { coordinates: geometry },
        legs: [{ annotation: { distance: [100, 200], duration: [10, 20] } }],
        ...overrides,
      },
    ],
  };
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(1500);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("published route storage", () => {
  it("round-trips the provider geometry through the stored [lat, lng] format", () => {
    expect(legacyRouteCoordinates(stored)).toEqual(geometry);
  });
});

describe("verifiedGeometry", () => {
  it("returns cumulative distance and time when the provider matches the stored path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(osrm()))),
    );
    expect(await settle(verifiedGeometry(trip))).toEqual({
      coordinates: geometry,
      distanceMeters: [0, 100, 300],
      elapsedSeconds: [0, 10, 30],
    });
  });

  it("refuses a path that differs from the published one", async () => {
    const changed = [...geometry.slice(0, 2), [-5.7, 35.9]];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(osrm({ geometry: { coordinates: changed } })))),
    );
    expect(await settle(verifiedGeometry(trip))).toBeNull();
  });

  it("refuses a path without per-segment metrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(osrm({ legs: [{}] })))),
    );
    expect(await settle(verifiedGeometry(trip))).toBeNull();
  });
});

describe("walkingResolver", () => {
  it("adds the snap distances to a pedestrian route that reaches both ends", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(osrm({}, 2)))),
    );
    const walk = await settle(walkingResolver(() => undefined)(geometry[0]!, geometry[2]!));
    expect(walk?.distanceMeters).toBe(304);
  });

  it("rejects a route whose ends do not snap onto the path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(osrm({}, 12)))),
    );
    expect(await settle(walkingResolver(() => undefined)(geometry[0]!, geometry[2]!))).toBeNull();
  });

  it("reports an unavailable provider instead of inventing a path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const unavailable = vi.fn();
    expect(await settle(walkingResolver(unavailable)(geometry[0]!, geometry[2]!))).toBeNull();
    expect(unavailable).toHaveBeenCalledOnce();
  });
});
