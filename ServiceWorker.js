/* GitHub Pages answers every file with Cache-Control: max-age=600, so a player that plays for ten minutes and comes
   back re-downloads the whole 14 MB build. This worker keeps the payloads on the device instead.

   The cache name carries a build stamp that Tools/publish-build.sh writes into this file from a hash of the payloads,
   so a new build arrives as a new cache: activation deletes the old one. Without the stamp a stale cache would keep
   serving last week's wasm against this week's data file, which is worse than a download. */

const BUILD = "55e804ba2b9b";
const CACHE = "astralis-tails-" + BUILD;
const SHELL = ["index.html", "TemplateData/style.css", "manifest.webmanifest", "TemplateData/icon.jpg"];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .catch(function () { /* an offline install is not a reason to refuse to install */ })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      const names = await caches.keys();
      await Promise.all(
        names.map(function (name) {
          if (name !== CACHE && name.indexOf("astralis-tails-") === 0) return caches.delete(name);
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The worker itself must come from the network or a new build could never be discovered.
  if (url.pathname.indexOf("ServiceWorker.js") !== -1) return;

  // Payloads never change without a new build stamp, so the copy on the device is always right for this cache name.
  const isPayload = url.pathname.indexOf("/Build/") !== -1 || url.pathname.indexOf("/TemplateData/") !== -1;
  event.respondWith(isPayload ? cacheFirst(request) : networkFirst(request));
});
