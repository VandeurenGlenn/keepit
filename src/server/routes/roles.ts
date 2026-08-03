import { Router } from '@koa/router'
import { grantRole, revokeRole, hasRole } from '../helpers/roles.js'
import { users } from '../database/database.js'

const router = new Router({
  prefix: '/api/roles'
})

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
  const targetUser = users[ctx.params.uuid]
  const role = ctx.params.role

  if (!targetUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  if (role === 'owner' || (role === 'admin' && targetUser.roles?.includes('owner'))) {
    ctx.status = 400
    ctx.body = { error: 'Cannot revoke owner privileges', message: 'Owner permissions cannot be removed here' }
    return
  }

  if (role === 'admin' && targetUser.roles?.includes('admin')) {
    const adminCount = Object.values(users).filter((user) => user.roles?.includes('admin')).length
    if (adminCount <= 1) {
      ctx.status = 400
      ctx.body = { error: 'Cannot revoke last admin', message: 'At least one admin must remain' }
      return
    }
  }

  await revokeRole(ctx.params.uuid, ctx.params.role)
  ctx.status = 200
})

export default router.routes()
