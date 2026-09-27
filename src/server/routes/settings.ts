import { Router } from '@koa/router'
import { appSettings, appSettingsStore, users } from '../database/database.js'
import { hasRole } from '../helpers/roles.js'

const router = new Router({ prefix: '/api/settings' })

router.get('/', async (ctx) => {
  ctx.body = appSettings
})

router.patch('/', async (ctx) => {
  if (!users[ctx.state.userid] || !hasRole(ctx.state.userid, 'admin')) {
    ctx.status = 403
    ctx.body = { error: 'Alleen admins kunnen globale instellingen wijzigen.' }
    return
  }

  const body = (ctx.request.body || {}) as { addressCountry?: unknown }
  const addressCountry = String(body.addressCountry || '').trim().toUpperCase()
  if (addressCountry && !/^[A-Z]{2}$/.test(addressCountry)) {
    ctx.status = 400
    ctx.body = { error: 'Gebruik een geldige ISO-landcode van twee letters.' }
    return
  }

  if (addressCountry) appSettings.addressCountry = addressCountry
  else delete appSettings.addressCountry
  await appSettingsStore.put(appSettings)
  ctx.body = appSettings
})

export default router.routes()
