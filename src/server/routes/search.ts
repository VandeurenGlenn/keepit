import { Router } from '@koa/router'
import { companies, invoices, jobs, quotes, users } from '../database/database.js'
import { hasRole } from '../helpers/roles.js'
import { normalizeWorkspaceSearch, workspaceSearchRank } from '../helpers/workspace-search.js'

type SearchResult = { id: string; type: string; title: string; subtitle?: string; href: string; icon: string }
const router = new Router({ prefix: '/api/search' })

router.get('/', (ctx) => {
  const query = normalizeWorkspaceSearch(String(ctx.query.q || '').trim().slice(0, 120))
  if (query.length < 2) { ctx.body = { results: [] }; return }
  const results: Array<{ item: SearchResult; rank: number }> = []
  const add = (item: SearchResult, ...fields: Array<string | undefined>) => {
    const rank = workspaceSearchRank(query, item.title, item.subtitle, ...fields)
    if (rank) results.push({ item, rank })
  }

  for (const [id, job] of Object.entries(jobs)) {
    const customer = job.customerId ? companies[job.customerId] : undefined
    add({ id, type: 'Job', title: job.name, subtitle: [customer?.name, job.place?.formattedAddress].filter(Boolean).join(' · '), href: `#!/job?selected=${encodeURIComponent(id)}`, icon: 'inventory2' }, job.description)
  }

  if (hasRole(ctx.state.userid, 'admin')) {
    for (const [id, company] of Object.entries(companies)) {
      const supplier = company.relationshipType === 'supplier'
      add({ id, type: supplier ? 'Leverancier' : 'Klant', title: company.name, subtitle: company.place?.formattedAddress, href: `#!/${supplier ? 'suppliers' : 'companies'}?selected=${encodeURIComponent(id)}`, icon: supplier ? 'local_shipping' : 'source_environment' })
    }
    for (const [id, quote] of Object.entries(quotes)) {
      add({ id, type: 'Offerte', title: quote.name, subtitle: jobs[quote.jobId]?.name, href: `#!/quote?selected=${encodeURIComponent(id)}`, icon: 'request_quote' }, quote.description)
    }
    for (const [id, invoice] of Object.entries(invoices)) {
      add({ id, type: 'Factuur', title: invoice.name, subtitle: companies[invoice.company]?.name, href: `#!/invoice?selected=${encodeURIComponent(id)}`, icon: 'receipt' }, invoice.description, jobs[invoice.job]?.name)
    }
    for (const [id, user] of Object.entries(users)) {
      add({ id, type: 'Medewerker', title: user.name || user.email || 'Medewerker', subtitle: user.email, href: `#!/users?selected=${encodeURIComponent(id)}`, icon: 'person' }, user.phone)
    }
  }

  results.sort((a, b) => b.rank - a.rank || a.item.title.localeCompare(b.item.title, 'nl'))
  ctx.body = { results: results.slice(0, 18).map(({ item }) => item) }
})

export default router.routes()
