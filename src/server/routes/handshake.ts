import Router from '@koa/router'
import { users } from './../database/database.js'
import { generateTicket } from '../helpers/auth.js'

const router = new Router({
  prefix: '/api/handshake'
})

router.get('/', async (ctx) => {
  if (users[ctx.state?.userid]) {
    ctx.body = await generateTicket(ctx.state.userid, ctx.request.ip)
  } else {
    ctx.body = 'NOT_REGISTERED'
  }

  ctx.status = 200
  return
})

export default router.routes()
