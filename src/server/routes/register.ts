import Router from '@koa/router'
import { users, usersStore } from '../database/database.js'

const router = new Router({
  prefix: '/api/register'
})

router.use(async (ctx, next) => {
  if (users[ctx.state.userid]) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden, already registered.' }
    return
  }
})

router.post('/', async (ctx, next) => {
  users[ctx.state.userid] = {
    name: ctx.request.body.name || ctx.state.googleProfile.name,
    email: ctx.request.body.email || ctx.state.googleProfile.email,
    picture: ctx.request.body.picture || ctx.state.googleProfile.picture,
    place: ctx.request.body.place || '',
    phone: ctx.request.body.phone || ctx.state.googleProfile.phone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await usersStore.put(users)
})

export default router.routes()
