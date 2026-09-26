import { Router } from '@koa/router'
import { grantRole, revokeRole, hasRole } from '../helpers/roles.js'
import { invites, invitesStore, users } from '../database/database.js'

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
  const { uuid, role } = ctx.params
  if (!['admin', 'roles', 'user'].includes(role) || role === 'owner') {
    ctx.status = 400
    ctx.body = { error: 'Invalid role', message: 'Deze rol kan niet via teambeheer worden toegekend' }
    return
  }
  if (!users[uuid] && !invites[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  if (invites[uuid]) {
    invites[uuid].roles = Array.from(new Set([...(invites[uuid].roles || []), role]))
    await invitesStore.put(invites)
  } else {
    await grantRole(uuid, role)
  }
  ctx.status = 200
})

router.post('/revoke/:uuid/:role', async (ctx) => {
  const targetUser = users[ctx.params.uuid] || invites[ctx.params.uuid]
  const role = ctx.params.role

  if (!['admin', 'roles', 'user'].includes(role) || role === 'owner') {
    ctx.status = 400
    ctx.body = { error: 'Invalid role', message: 'Deze rol kan niet via teambeheer worden verwijderd' }
    return
  }

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

  if (invites[ctx.params.uuid]) {
    invites[ctx.params.uuid].roles = (invites[ctx.params.uuid].roles || []).filter((item) => item !== role)
    await invitesStore.put(invites)
  } else {
    await revokeRole(ctx.params.uuid, role)
  }
  ctx.status = 200
})

export default router.routes()
