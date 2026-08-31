const CACHE = "malaguena-v2"

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  // The admin goes straight to the network: never cached for offline, and
  // a 401 answered through the worker would swallow the browser's own
  // basic-auth prompt.
  if (url.pathname.startsWith("/admin")) return

  if (request.mode === "navigate") {
    // Pages: network first, cached copy when offline, home as last resort.
    event.respondWith(
      fetch(request)
        .then(response => stash(request, response))
        .catch(() =>
          caches.match(request)
            .then(hit => hit || caches.match("/"))
            .then(hit => hit || Response.error())
        )
    )
  } else {
    // Fingerprinted assets never change: cache first.
    event.respondWith(
      caches.match(request).then(hit =>
        hit || fetch(request).then(response => stash(request, response)).catch(() => Response.error())
      )
    )
  }
})

function stash(request, response) {
  if (response.ok) {
    const copy = response.clone()
    caches.open(CACHE).then(cache => cache.put(request, copy))
  }
  return response
}
