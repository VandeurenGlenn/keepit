import Router from '@koa/router'

import { invoices, jobs } from '../database/database.js'

const router = new Router({
  prefix: '/api/invoice'
})

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  ctx.body = invoices[uuid] || {}
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
