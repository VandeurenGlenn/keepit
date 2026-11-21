const routes = new Set([
  'home', 'timeline', 'planning', 'jobs', 'job', 'quotes', 'quote',
  'companies', 'suppliers', 'invoices', 'invoice', 'shop', 'users',
  'backups', 'reports', 'register', 'checkin', 'checkout', 'sync'
])

export function parseWorkspaceRoute(hash: string) {
  const route = hash.startsWith('#!/') ? hash.slice(3) : hash
  const queryStart = route.indexOf('?')
  const path = (queryStart < 0 ? route : route.slice(0, queryStart)) || 'home'
  const params = new URLSearchParams(queryStart < 0 ? '' : route.slice(queryStart + 1))
  return { path, params, known: routes.has(path) }
}
