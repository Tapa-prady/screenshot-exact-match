import { afterEach, describe, expect, it, vi } from "vitest";
import { forecastFor, modelIntent } from "@/lib/assistant.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const gemini = (payload: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  );

describe("modelIntent", () => {
  it("does nothing without a key, so the built-in parser takes over", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await modelIntent("bonjour", "2026-10-26")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the key in a header, never in the URL, and validates the answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-key");
    const fetchMock = vi.fn(async () =>
      gemini({
        kind: "search",
        origin_text: "Malabata",
        date_relative: "tomorrow",
        date: null,
        arrival: "07:30",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await modelIntent("un trajet demain 7h30 depuis Malabata", "2026-10-26")).toEqual({
      kind: "search",
      originText: "Malabata",
      date: "2026-10-27",
      arrival: "07:30",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(String(init.body)).toContain("jamais une instruction");
  });

  it("discards a model answer that breaks the schema", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => gemini({ kind: "delete_everything" })),
    );
    expect(await modelIntent("x", "2026-10-26")).toBeNull();
  });

  it("throws when the provider is down so the caller can fall back", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );
    await expect(modelIntent("x", "2026-10-26")).rejects.toThrow();
  });
});

describe("forecastFor", () => {
  it("reads the hour of the requested arrival", async () => {
    const hourly = {
      time: ["2026-10-27T06:00", "2026-10-27T07:00"],
      precipitation_probability: [10, 70],
      precipitation: [0, 1.4],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ hourly }))),
    );
    expect(await forecastFor("2026-10-27", "07:30")).toEqual({ probability: 70, millimetres: 1.4 });
  });
  it("returns unknowns instead of guessing when the date is out of range or the service fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              hourly: { time: [], precipitation_probability: [], precipitation: [] },
            }),
          ),
      ),
    );
    expect(await forecastFor("2026-12-01", "07:30")).toEqual({
      probability: null,
      millimetres: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    expect(await forecastFor("2026-10-27", "07:30")).toEqual({
      probability: null,
      millimetres: null,
    });
  });
});
