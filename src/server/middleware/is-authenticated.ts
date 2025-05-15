import { verifyToken } from '../helpers/auth.js'
import { bannedUsers, users, usersStore } from '../database/database.js'
export const isAuthenticated = async (ctx, next) => {
  const token = ctx.request.headers['Authorization'] || ctx.request.headers['authorization']

  if (!token) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }
  const verified = await verifyToken(token)

  if (!verified) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }

  if (bannedUsers[verified.userid]) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden' }
    return
  }

  ctx.state.userid = verified.userid
  ctx.state.googleProfile = verified.payload

  await next()
}
