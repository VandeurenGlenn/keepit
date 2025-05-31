import Router from '@koa/router'
import { users } from './../database/database.js'

const router = new Router({
  prefix: '/api/handshake'
})

router.get('/', async (ctx) => {
  if (users[ctx.state.userid]) {
    ctx.body = 'REGISTERED'
  } else {
    ctx.body = 'NOT_REGISTERED'
  }
  ctx.status = 200
  return
})

export default router.routes()
