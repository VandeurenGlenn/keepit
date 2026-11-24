import { isCacheableStaticResponse, staticCacheKey } from './helpers/static-cache-policy.js'

const worker: any = globalThis
const STATIC_CACHE = 'keepit-static-v2'

worker.addEventListener('install', (event) => {
  event.waitUntil(worker.caches.open(STATIC_CACHE).then(async (cache) => {
    const themeUrl = new URL('/assets/keepit-theme.css', worker.location.origin)
    const [page, theme] = await Promise.all([fetch('/', { cache: 'reload' }), fetch(themeUrl, { cache: 'reload' })])
    if (!isCacheableStaticResponse(page, true) || !isCacheableStaticResponse(theme, false)) {
      throw new Error('Keepit-startpagina of thema niet beschikbaar')
    }
    await Promise.all([cache.put('/', page), cache.put(themeUrl.href, theme)])
    await worker.skipWaiting()
  }))
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
  const key = staticCacheKey(url, worker.location.origin, request.mode)
  if (!key || request.headers.has('authorization')) return
  const cache = worker.caches.open(STATIC_CACHE)
  const network = fetch(request)
  const cachedResponse = () => cache.then((value) => value.match(key)).catch(() => undefined)
  // Keep the worker alive until the cache write finishes without delaying the page.
  event.waitUntil(network.then((response) => {
    if (!isCacheableStaticResponse(response, request.mode === 'navigate')) return
    const copy = response.clone()
    return cache.then((value) => value.put(key, copy))
  }).catch(() => undefined))
  event.respondWith(network.then(async (response) => {
    if (response.status >= 500) return await cachedResponse() || response
    return response
  }, async () => await cachedResponse() || Response.error()))
})

worker.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url
  if (typeof target !== 'string' || !target.startsWith('#!/')) return
  const targetUrl = new URL(target, worker.registration.scope).href
  event.waitUntil(
    worker.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(worker.registration.scope))
      if (existing) {
        return existing.focus().then(() => {
          existing.postMessage({ type: 'keepit-notification-open', target, id: event.notification.data?.notificationId, userId: event.notification.data?.userId })
        }).catch(() => worker.clients.openWindow(targetUrl))
      }
      return worker.clients.openWindow(targetUrl)
    })
  )
})
