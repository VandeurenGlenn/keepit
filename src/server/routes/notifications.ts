import { Router } from '@koa/router'
import { notifications, notificationsStore } from '../database/database.js'

const router = new Router({ prefix: '/api/notifications' })

router.get('/', async (ctx) => {
  const unreadOnly = ctx.query.unread === 'true'
  const items = notifications[ctx.state.userid] || []
  ctx.body = items.filter((item) => !unreadOnly || !item.readAt).slice(-50).reverse()
})

router.patch('/:id/read', async (ctx) => {
  const items = notifications[ctx.state.userid] || []
  const item = items.find((notification) => notification.id === ctx.params.id)
  if (!item) {
    ctx.status = 404
    ctx.body = { error: 'Melding niet gevonden' }
    return
  }
  item.readAt ||= new Date().toISOString()
  await notificationsStore.put(notifications)
  ctx.status = 204
})

export default router.routes()
