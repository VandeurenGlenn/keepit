const worker: any = globalThis
const STATIC_CACHE = 'keepit-static-v1'

worker.addEventListener('install', (event) => {
  event.waitUntil(worker.caches.open(STATIC_CACHE).then((cache) => cache.addAll(['/'])))
  worker.skipWaiting()
})

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    worker.caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('keepit-static-') && key !== STATIC_CACHE).map((key) => worker.caches.delete(key))
    )).then(() => worker.clients.claim())
  )
})

worker.addEventListener('fetch', (event) => {
  const request = event.request as Request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== worker.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/ws') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void worker.caches.open(STATIC_CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => worker.caches.match('/'))
    )
    return
  }

  // Prefer the deployed version while online; fall back to the last verified
  // response offline. This avoids serving an old JS bundle after an update.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) void worker.caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()))
        return response
      })
      .catch(() => worker.caches.match(request))
  )
})

worker.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '#!/checkout'
  const targetUrl = new URL(target, worker.location.origin).href
  event.waitUntil(
    worker.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients[0]
      if (existing) {
        return existing.navigate(targetUrl).then((client) => client?.focus())
      }
      return worker.clients.openWindow(targetUrl)
    })
  )
})
