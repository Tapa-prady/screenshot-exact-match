import { describe, expect, it } from "vitest";
import {
  normalizeMoroccanPhone,
  osmLink,
  positionMessage,
  smsHref,
  whatsappHref,
} from "@/lib/trip-share";

describe("normalizeMoroccanPhone", () => {
  it.each([
    ["06 12 34 56 78", "+212612345678"],
    ["0712345678", "+212712345678"],
    ["+212 6.12.34.56.78", "+212612345678"],
    ["00212612345678", "+212612345678"],
    ["0539 12 34 56", "+212539123456"],
  ])("accepts %s", (input, expected) => expect(normalizeMoroccanPhone(input)).toBe(expected));

  it.each(["", "12345", "0812345678", "+33612345678", "06123456789", "abcdefghij"])(
    "rejects %s",
    (input) => {
      expect(normalizeMoroccanPhone(input)).toBeNull();
    },
  );
});

describe("messages and links", () => {
  it("builds an OpenStreetMap link and rejects impossible positions", () => {
    expect(osmLink(35.7595, -5.834)).toBe(
      "https://www.openstreetmap.org/?mlat=35.75950&mlon=-5.83400#map=17/35.75950/-5.83400",
    );
    expect(() => osmLink(91, 0)).toThrow(RangeError);
    expect(() => osmLink(Number.NaN, 0)).toThrow(RangeError);
  });

  it("states honestly when the position is unknown", () => {
    expect(positionMessage({ firstName: "Sara", position: null, alert: true })).toContain(
      "n’est pas disponible",
    );
    expect(
      positionMessage({ firstName: "", position: { lat: 35.7, lng: -5.8 }, alert: false }),
    ).toMatch(/^Rafiq : Une étudiante est en covoiturage\. Ma position : https:/);
  });

  it("encodes the text for SMS and WhatsApp", () => {
    expect(smsHref("+212612345678", "a b&c")).toBe("sms:+212612345678?body=a%20b%26c");
    expect(whatsappHref("+212612345678", "a b")).toBe("https://wa.me/212612345678?text=a%20b");
  });
});
