import Router from '@koa/router'

import { users } from './../database/database.js'

const router = new Router({
  prefix: '/api/users'
})

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  ctx.body = users[uuid] || {}
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.get('/', async (ctx) => {
  ctx.body = users
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
