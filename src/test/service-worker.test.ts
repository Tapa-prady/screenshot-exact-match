import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(fetchImpl: () => Promise<unknown>) {
  const listeners: Record<string, Listener> = {};
  const offline = { offline: true };
  const cache = { add: vi.fn(async () => undefined) };
  const caches = { open: vi.fn(async () => cache), match: vi.fn(async () => offline), keys: vi.fn(async () => ["rafiq-shell-v1", "old"]), delete: vi.fn(async () => true) };
  const self = { addEventListener: (name: string, listener: Listener) => { listeners[name] = listener; }, skipWaiting: vi.fn(async () => undefined), clients: { claim: vi.fn(async () => undefined) } };
  runInNewContext(readFileSync("public/sw.js", "utf-8"), { self, caches, fetch: fetchImpl });
  return { listeners, caches, offline, cache };
}

describe("service worker", () => {
  it("falls back to the offline page only for page navigations", async () => {
    const { listeners, offline } = loadWorker(async () => { throw new Error("offline"); });
    const respondWith = vi.fn();
    listeners["fetch"]!({ request: { method: "GET", mode: "navigate" }, respondWith });
    expect(await respondWith.mock.calls[0]![0]).toBe(offline);
  });

  it("never touches API calls, writes or assets", () => {
    const { listeners } = loadWorker(async () => { throw new Error("offline"); });
    for (const request of [{ method: "POST", mode: "navigate" }, { method: "GET", mode: "cors" }, { method: "GET", mode: "no-cors" }]) {
      const respondWith = vi.fn();
      listeners["fetch"]!({ request, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it("serves the real page when the network works", async () => {
    const live = { live: true };
    const { listeners } = loadWorker(async () => live);
    const respondWith = vi.fn();
    listeners["fetch"]!({ request: { method: "GET", mode: "navigate" }, respondWith });
    expect(await respondWith.mock.calls[0]![0]).toBe(live);
  });

  it("caches only the offline page and drops older caches", async () => {
    const { listeners, cache, caches } = loadWorker(async () => undefined);
    const waits: Promise<unknown>[] = [];
    listeners["install"]!({ waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    listeners["activate"]!({ waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
    expect(cache.add).toHaveBeenCalledWith("/offline.html");
    expect(caches.delete).toHaveBeenCalledWith("old");
    expect(caches.delete).not.toHaveBeenCalledWith("rafiq-shell-v1");
  });
});
