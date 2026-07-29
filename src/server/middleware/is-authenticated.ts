import { verifyToken } from '../helpers/auth.js'
import { bannedUsers, users, usersStore } from '../database/database.js'
export const isAuthenticated = async (ctx, next) => {
  // Product images are requested by native <img> elements, which cannot attach
  // the token stored in localStorage. The image route itself only accepts exact
  // source URLs already present in our trusted product catalogs.
  if (ctx.path === '/api/shop/image') {
    await next()
    return
  }

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

export const isWebSocketAuthenticated = async (request) => {
  const token = request.headers['Authorization'] || request.headers['authorization']

  if (!token) {
    return 'Unauthorized'
  }
  const verified = await verifyToken(token)

  if (!verified) {
    return 'unVerified'
  }

  if (bannedUsers[verified.userid]) {
    return 'Forbidden'
  }

  return {
    userid: verified.userid,
    googleProfile: verified.payload
  }
}
