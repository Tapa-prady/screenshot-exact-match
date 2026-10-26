import { describe, expect, it } from "vitest";
import { legacyRouteCoordinates, moroccoInstant, tripRunsOnDate } from "@/lib/route-adapter";

describe("Route integration", () => {
  it("converts stored latitude-longitude to GeoJSON order", () => {
    expect(legacyRouteCoordinates([[35.7, -5.8]])).toEqual([[-5.8, 35.7]]);
  });
  it("interprets requested arrival in Morocco, not the device timezone", () => {
    // Morocco was on GMT+1 until 20 September 2026.
    expect(moroccoInstant("2026-09-01", "08:30")).toBe(Date.UTC(2026, 8, 1, 7, 30));
  });
  it("uses GMT after Morocco's return to standard time on 20 September 2026", () => {
    expect(moroccoInstant("2026-10-26", "08:30")).toBe(Date.UTC(2026, 9, 26, 8, 30));
  });
  it("uses the actual Moroccan Ramadan offset", () => {
    expect(moroccoInstant("2026-03-01", "08:30")).toBe(Date.UTC(2026, 2, 1, 8, 30));
  });
  it("matches a one-off date or recurring ISO weekday", () => {
    expect(tripRunsOnDate({ one_off_date: "2026-10-26", weekdays: [] }, "2026-10-26")).toBe(true);
    expect(tripRunsOnDate({ one_off_date: "2026-10-25", weekdays: [1] }, "2026-10-26")).toBe(false);
    expect(tripRunsOnDate({ one_off_date: null, weekdays: [1] }, "2026-10-26")).toBe(true);
    expect(tripRunsOnDate({ one_off_date: null, weekdays: [7] }, "2026-10-25")).toBe(true);
  });
});
