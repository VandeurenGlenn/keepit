import Router from '@koa/router'
import { users, usersStore } from '../database/database.js'

const router = new Router({
  prefix: '/api/register'
})

router.post('/', async (ctx, next) => {
  if (users[ctx.state.userid]) {
    ctx.status = 400
    ctx.body = { error: 'User already registered' }
    return
  }

  users[ctx.state.userid] = {
    name: ctx.request.body.name || ctx.state.googleProfile.name,
    email: ctx.request.body.email || ctx.state.googleProfile.email,
    picture: ctx.request.body.picture || ctx.state.googleProfile.picture,
    place: ctx.request.body.place || '',
    phone: ctx.request.body.phone || ctx.state.googleProfile.phone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  if (Object.keys(users).length === 1) {
    users[ctx.state.userid].roles = ['admin']
  }
  await usersStore.put(users)
  ctx.body = { content: users[ctx.state.userid] }
  ctx.status = 201
  ctx.set('Content-Type', 'application/json')
  return
})

export default router.routes()
