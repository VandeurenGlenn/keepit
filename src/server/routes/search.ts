import { Router } from '@koa/router'
import { companies, invoices, jobs, quotes, users } from '../database/database.js'
import { hasRole } from '../helpers/roles.js'

type SearchResult = { id: string; type: string; title: string; subtitle?: string; href: string; icon: string }
const router = new Router({ prefix: '/api/search' })
const matches = (query: string, ...values: unknown[]) => values.some((value) => `${value || ''}`.toLocaleLowerCase('nl').includes(query))

router.get('/', (ctx) => {
  const query = `${ctx.query.q || ''}`.trim().toLocaleLowerCase('nl').slice(0, 120)
  if (query.length < 2) { ctx.body = { results: [] }; return }
  const results: SearchResult[] = []

  for (const [id, job] of Object.entries(jobs)) {
    if (matches(query, job.name, job.description, job.place?.formattedAddress)) {
      results.push({ id, type: 'Job', title: job.name, subtitle: job.place?.formattedAddress, href: `#!/job?selected=${id}`, icon: 'inventory2' })
    }
  }

  if (hasRole(ctx.state.userid, 'admin')) {
    for (const [id, company] of Object.entries(companies)) {
      if (matches(query, company.name, company.place?.formattedAddress)) {
        const supplier = company.relationshipType === 'supplier'
        results.push({ id, type: supplier ? 'Leverancier' : 'Klant', title: company.name, subtitle: company.place?.formattedAddress, href: supplier ? '#!/suppliers' : '#!/companies', icon: supplier ? 'local_shipping' : 'source_environment' })
      }
    }
    for (const [id, quote] of Object.entries(quotes)) {
      if (matches(query, quote.name, quote.description, jobs[quote.jobId]?.name)) results.push({ id, type: 'Offerte', title: quote.name, subtitle: jobs[quote.jobId]?.name, href: `#!/quote?selected=${id}`, icon: 'request_quote' })
    }
    for (const [id, invoice] of Object.entries(invoices)) {
      if (matches(query, invoice.name, invoice.description, companies[invoice.company]?.name, jobs[invoice.job]?.name)) results.push({ id, type: 'Factuur', title: invoice.name, subtitle: companies[invoice.company]?.name, href: `#!/invoice?selected=${id}`, icon: 'receipt' })
    }
    for (const [id, user] of Object.entries(users)) {
      if (matches(query, user.name, user.email, user.phone)) results.push({ id, type: 'Medewerker', title: user.name, subtitle: user.email, href: '#!/users', icon: 'person' })
    }
  }

  ctx.body = { results: results.slice(0, 18) }
})

export default router.routes()
