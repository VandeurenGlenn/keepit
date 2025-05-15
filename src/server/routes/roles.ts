import Router from '@koa/router'
import { grantRole, revokeRole, hasRole } from '../helpers/roles.js'
import isUser from '../middleware/is-user.js'
import { isAuthenticated } from '../middleware/is-authenticated.js'

const router = new Router({
  prefix: '/api/roles'
})
router.use(isAuthenticated)
router.use(isUser)

router.use(async (ctx, next) => {
  if (!hasRole(ctx.state.userid, 'roles') && !hasRole(ctx.state.userid, 'admin')) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden' }
    return
  }
  await next()
})

router.post('/grant/:uuid/:role', async (ctx) => {
  await grantRole(ctx.params.uuid, ctx.params.role)
  ctx.status = 200
})

router.post('/revoke/:uuid/:role', async (ctx) => {
  await revokeRole(ctx.params.uuid, ctx.params.role)
  ctx.status = 200
})

export default router.routes()
