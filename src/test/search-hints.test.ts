import { beforeEach, describe, expect, it, vi } from "vitest";
import { shortAddress } from "@/lib/address";

let rows: unknown[] = [];
let verified = true;
let accountType = "student";
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          limit: async () => ({ data: rows, error: null }),
          maybeSingle: async () => ({
            data: table === "profiles" ? { verified, account_type: accountType } : null,
          }),
        }),
      }),
    }),
  },
}));

const ME = "me";
const base = {
  active: true,
  one_off_date: null,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  dest_lat: 35.76,
  dest_lng: -5.81,
};
const query = {
  origin: [-5.8, 35.77] as [number, number],
  destination: [-5.81, 35.76] as [number, number],
  date: "2030-01-02",
  arrival: "08:30",
};

beforeEach(() => {
  verified = true;
  accountType = "student";
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "key");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
});

describe("shortAddress", () => {
  it("drops the Arabic duplicates and keeps the readable start", () => {
    expect(
      shortAddress(
        "Riad Tétouan رياض تطوان, Tanger-Medina طنجة المدينة, Tanger, Tanger-Assilah, 90000, Maroc",
      ),
    ).toBe("Riad Tétouan, Tanger-Medina, Tanger");
  });
  it("never returns an empty label", () => {
    expect(shortAddress("رياض")).toBe("رياض");
  });
});

describe("searchRides explains an empty answer", () => {
  it("says when nobody published anything", async () => {
    rows = [];
    const { searchRides } = await import("@/lib/routing.server");
    expect((await searchRides(ME, query)).hint).toMatch(/Aucun conducteur/);
  });
  it("says when the only trip is the caller's own", async () => {
    rows = [{ ...base, id: "t1", driver_id: ME }];
    const { searchRides } = await import("@/lib/routing.server");
    expect((await searchRides(ME, query)).hint).toMatch(/le vôtre/);
  });
  it("says when trips go somewhere else", async () => {
    rows = [{ ...base, id: "t2", driver_id: "other", dest_lat: 35.9 }];
    const { searchRides } = await import("@/lib/routing.server");
    expect((await searchRides(ME, query)).hint).toMatch(/pas vers cette arrivée/);
  });
  it("tells a far-away passenger the distance, without calling the routing service", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    rows = [
      {
        ...base,
        id: "t4",
        driver_id: "other",
        route: [
          [35.76, -5.81],
          [35.77, -5.8],
        ],
      },
    ];
    const { searchRides } = await import("@/lib/routing.server");
    const result = await searchRides(ME, { ...query, origin: [-5.7, 35.9], destination: null });
    expect(result.hint).toMatch(/à environ \d+ m du chemin/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("keeps search for students: an external driver gets a clear message", async () => {
    verified = false;
    rows = [{ ...base, id: "t3", driver_id: "other" }];
    const { searchRides } = await import("@/lib/routing.server");
    expect((await searchRides(ME, query)).error).toMatch(/réservées aux comptes Étudiant/);
  });
  it("keeps search for student accounts: a driver-mode account is told to switch", async () => {
    accountType = "driver";
    rows = [{ ...base, id: "t5", driver_id: "other" }];
    const { searchRides } = await import("@/lib/routing.server");
    expect((await searchRides(ME, query)).error).toMatch(/comptes Étudiant/);
  });
  it("fails loudly, not with an empty list, when the server key is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { searchRides } = await import("@/lib/routing.server");
    expect((await searchRides(ME, query)).error).toMatch(/pas accessibles/);
  });
});
