import { describe, expect, it } from "vitest";
import {
  addDays,
  answerFaq,
  TOPICS,
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
  it("answers small talk with a greeting, not a search", () => {
    expect(parseIntentFallback("salut ça va", TODAY)).toMatchObject({
      kind: "faq",
      topic: "greeting",
    });
  });
  it("returns unknown for what it cannot help with", () => {
    expect(parseIntentFallback("quel est le meilleur film ?", TODAY).kind).toBe("unknown");
  });
});

describe("everyday phrasing", () => {
  const cases: [string, Record<string, unknown>][] = [
    [
      "je pars de Iberia demain à 8h30",
      { kind: "search", originText: "Iberia", date: "2026-10-27", arrival: "08:30" },
    ],
    [
      "je suis à Marshan, je dois arriver à 8 heures",
      { kind: "search", originText: "Marshan", arrival: "08:00" },
    ],
    [
      "de Malabata à l'ENSA lundi 7h45",
      { kind: "search", originText: "Malabata", date: "2026-11-02", arrival: "07:45" },
    ],
    [
      "un trajet vendredi 8h depuis Boukhalef",
      { kind: "search", originText: "Boukhalef", date: "2026-10-30", arrival: "08:00" },
    ],
    ["un trajet demain matin", { kind: "search", originText: null, date: "2026-10-27" }],
    ["combien ça coûte ?", { kind: "faq", topic: "price" }],
    ["comment publier un trajet ?", { kind: "faq", topic: "publish" }],
    ["comment réserver ?", { kind: "faq", topic: "book" }],
    ["comment annuler ma réservation", { kind: "faq", topic: "cancel" }],
    ["c'est quoi le SOS ?", { kind: "faq", topic: "safety" }],
    ["un conducteur doit être étudiant ?", { kind: "faq", topic: "drivers" }],
    ["tu peux faire quoi ?", { kind: "faq", topic: "how" }],
    ["merci !", { kind: "faq", topic: "thanks" }],
    ["mes réservations", { kind: "bookings" }],
    ["va-t-il pleuvoir demain à 8h ?", { kind: "weather", date: "2026-10-27", arrival: "08:00" }],
  ];
  it.each(cases)("%s", (text, expected) => {
    expect(parseIntentFallback(text, TODAY)).toMatchObject(expected);
  });
  it("gives a fixed answer for every topic", () => {
    for (const topic of TOPICS) expect(answerFaq(topic).length).toBeGreaterThan(20);
    expect(answerFaq("price")).toContain("20 DH");
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
