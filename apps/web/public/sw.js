/**
 * Offline support.
 *
 * A tournament is often run in a sports hall with no usable signal, so the app
 * has to survive losing the network mid-event. It is hand-written rather than
 * generated because the requirement is small and a build-time asset manifest
 * would be one more thing to keep in step.
 *
 * Strategy: serve from the network when it is there and remember what came back;
 * fall back to the cache when it is not. That way a reload never serves stale
 * code while online, and never fails while offline.
 */

const CACHE = "bracketeer-v1";

// maxgfr.github.io serves many apps from one origin, and Cache Storage belongs
// to the origin: this worker only ever touches caches named after this app.
const OURS = "bracketeer-";

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every tab to close, so a
  // reload mid-tournament picks up the fix rather than the bug.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["./", "./index.html"]).catch(() => undefined)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(OURS) && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GETs are cacheable, and only our own origin is ours to cache.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          // A full quota only costs the offline copy.
          void caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        // A navigation to a route we have never visited still has to land on the
        // shell, because routing happens in the browser.
        if (request.mode === "navigate") {
          const shell = await cache.match("./index.html");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
