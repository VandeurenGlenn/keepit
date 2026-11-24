export function staticCacheKey(url: URL, origin: string, mode: RequestMode): string | undefined {
  if (url.origin !== origin) return
  if (mode === 'navigate') return url.pathname === '/' || url.pathname === '/index.html' ? '/' : undefined
  if (/^\/[\w.-]+\.(?:js|css|ico|webmanifest)$/.test(url.pathname) ||
      url.pathname.startsWith('/assets/') || url.pathname.startsWith('/themes/')) return url.href
}

export function isCacheableStaticResponse(response: Pick<Response, 'status' | 'redirected' | 'headers'>, navigation: boolean) {
  if (response.status !== 200 || response.redirected) return false
  const cacheControl = response.headers.get('cache-control') || ''
  if (/(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl)) return false
  const isHtml = /^text\/html\b/i.test(response.headers.get('content-type') || '')
  return navigation === isHtml
}
