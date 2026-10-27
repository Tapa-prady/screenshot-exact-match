import { describe, expect, it } from "vitest";
import { calculateRidePrice } from "@/lib/ride-pricing";

describe("Rafiq fare", () => {
  it("charges at least 5 DH even for one kilometer or less", () => {
    expect([0, 0.5, 1].map(calculateRidePrice)).toEqual([5, 5, 5]);
  });
  it("charges 2 DH/km for the first five kilometers", () => {
    expect(calculateRidePrice(5)).toBe(10);
  });
  it("charges 1 DH/km between five and ten kilometers", () => {
    expect(calculateRidePrice(8)).toBe(13);
    expect(calculateRidePrice(10)).toBe(15);
  });
  it("charges 0.5 DH/km beyond ten kilometers, rounded to a dirham", () => {
    expect(calculateRidePrice(15)).toBe(18);
  });
  it("never charges above 20 DH", () => {
    expect(calculateRidePrice(30)).toBe(20);
    expect(calculateRidePrice(100)).toBe(20);
  });
  it("rejects invalid distances", () => {
    for (const value of [-1, NaN, Infinity]) expect(() => calculateRidePrice(value)).toThrow();
  });
});
