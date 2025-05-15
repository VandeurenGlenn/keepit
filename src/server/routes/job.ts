import Router from '@koa/router'

import { jobs } from './../database/database.js'

const router = new Router({
  prefix: '/api/job'
})

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  ctx.body = jobs[uuid] || {}
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
