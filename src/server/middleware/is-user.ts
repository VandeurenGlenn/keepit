import { users } from '../database/database.js'

export default async (ctx, next) => {
  if (Object.keys(users)?.length > 0 && !users[ctx.state.userid]) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden, register first.' }
    return
  }

  await next()
}
