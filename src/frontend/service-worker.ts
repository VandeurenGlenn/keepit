const worker: any = globalThis

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
