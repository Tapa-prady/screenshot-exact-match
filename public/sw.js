// Rafiq service worker: makes the app installable and shows a friendly page when the network is down.
// It deliberately caches nothing else: sign-ins, bookings and live positions must always come from the network.
const CACHE = "rafiq-shell-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  // Only page navigations get a fallback; API calls, Supabase and everything else go straight to the network.
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
});
