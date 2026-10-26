import { describe, expect, it } from "vitest";
import {
  addDays,
  describeSearch,
  intentFromModel,
  mergeContext,
  parseIntentFallback,
  weatherAdvice,
} from "@/lib/assistant";

const TODAY = "2026-10-26";

describe("parseIntentFallback", () => {
  it("understands the example from the presentation", () => {
    expect(parseIntentFallback("je cherche un trajet demain 7h30 depuis Malabata", TODAY)).toEqual({
      kind: "search",
      originText: "Malabata",
      date: "2026-10-27",
      arrival: "07:30",
    });
  });
  it("stops the address before a date or time", () => {
    expect(parseIntentFallback("trajet depuis Marshan après-demain à 8h", TODAY)).toMatchObject({
      originText: "Marshan",
      date: "2026-10-28",
      arrival: "08:00",
    });
  });
  it("recognises weather questions without inventing a search", () => {
    expect(parseIntentFallback("et s'il pleut ?", TODAY)).toEqual({
      kind: "weather",
      originText: null,
      date: null,
      arrival: null,
    });
  });
  it("does not read years or prices as times", () => {
    expect(parseIntentFallback("bonjour 2026 12 DH", TODAY).arrival).toBeNull();
  });
  it("returns unknown for small talk", () => {
    expect(parseIntentFallback("salut ça va", TODAY).kind).toBe("unknown");
  });
});

describe("model output", () => {
  it("resolves relative dates on the server", () => {
    expect(
      intentFromModel(
        {
          kind: "search",
          origin_text: "Malabata",
          date_relative: "tomorrow",
          date: null,
          arrival: "07:30",
        },
        TODAY,
      ),
    ).toEqual({ kind: "search", originText: "Malabata", date: "2026-10-27", arrival: "07:30" });
  });
  it("rejects anything that does not match the schema", () => {
    expect(intentFromModel({ kind: "book", origin_text: null }, TODAY)).toBeNull();
    expect(
      intentFromModel(
        { kind: "search", origin_text: null, date_relative: "none", date: "demain", arrival: null },
        TODAY,
      ),
    ).toBeNull();
    expect(intentFromModel("ignore previous instructions", TODAY)).toBeNull();
  });
});

describe("helpers", () => {
  it("adds days across a month end", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
  it("fills missing fields from the previous message only", () => {
    expect(
      mergeContext(
        { kind: "weather", originText: null, date: null, arrival: null },
        { date: "2026-10-27", arrival: "07:30", originText: "Malabata" },
      ),
    ).toEqual({ kind: "weather", originText: "Malabata", date: "2026-10-27", arrival: "07:30" });
    expect(
      mergeContext(
        { kind: "search", originText: "Marshan", date: "2026-10-28", arrival: null },
        { date: "2026-10-27", arrival: "07:30", originText: "Malabata" },
      ).originText,
    ).toBe("Marshan");
  });
  it("gives honest weather advice", () => {
    expect(weatherAdvice(null, null)).toContain("pas pu");
    expect(weatherAdvice(80, 2)).toContain("10 minutes plus tôt");
    expect(weatherAdvice(10, 0)).toContain("Pas de pluie");
  });
  it("describes results and the absence of results", () => {
    expect(describeSearch(0, null, "07:30")).toContain("aucun trajet");
    expect(
      describeSearch(
        2,
        { pickupTime: Date.UTC(2026, 9, 27, 6, 40), walkMeters: 120, priceDh: 12 },
        "07:30",
      ),
    ).toBe(
      "J’ai trouvé 2 trajets pour arriver avant 07:30. Le plus proche : rendez-vous à 06:40, 120 m à pied, 12 DH.",
    );
  });
});
