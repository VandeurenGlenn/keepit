import { Router } from '@koa/router'
import { hours, users } from '../database/database.js'
import { buildWorkReport, resolveReportPeriod } from '../helpers/hours-report.js'

const router = new Router({ prefix: '/api/reports' })
router.get('/hours', (ctx) => {
  if (!users[ctx.state.userid]?.roles?.includes('admin')) {
    ctx.status = 403
    ctx.body = { error: 'Alleen admins kunnen rapporten bekijken.' }
    return
  }
  const period = resolveReportPeriod(String(ctx.query.from || ''), String(ctx.query.to || ''))
  if (!period) {
    ctx.status = 400
    ctx.body = { error: 'Kies een geldige periode van maximaal één jaar.' }
    return
  }
  ctx.body = buildWorkReport(hours, period.from, period.to)
})
export default router.routes()
