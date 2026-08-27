import { Router } from '@koa/router'
import { createReadStream } from 'fs'
import { automaticRetention, createBackup, listBackups, readBackup, resolveBackupFile, validateBackup } from '../helpers/backups.js'
import { operationalData, operationalStores } from '../database/database.js'
import { hasRole } from '../helpers/roles.js'

const router = new Router({ prefix: '/api/backups' })

router.use(async (ctx, next) => {
  if (!hasRole(ctx.state.userid, 'admin')) {
    ctx.status = 403
    ctx.body = { error: 'Alleen admins kunnen back-ups beheren' }
    return
  }
  await next()
})

router.get('/', async (ctx) => {
  ctx.body = { backups: await listBackups(), automaticRetention }
})

router.post('/', async (ctx) => {
  ctx.status = 201
  ctx.body = await createBackup('manual')
})

router.post('/restore', async (ctx) => {
  const body = (ctx.request.body || {}) as { backup?: unknown; confirmation?: string }
  if (body.confirmation !== 'HERSTEL') {
    ctx.status = 400
    ctx.body = { error: 'Bevestig het herstel met HERSTEL' }
    return
  }

  let backup
  try {
    backup = validateBackup(body.backup)
  } catch (error) {
    ctx.status = 400
    ctx.body = { error: error instanceof Error ? error.message : 'Ongeldig back-upbestand' }
    return
  }

  await createBackup('pre-restore')
  for (const [name, target] of Object.entries(operationalData)) {
    for (const key of Object.keys(target)) delete target[key]
    for (const [key, value] of Object.entries(backup.datasets[name])) target[key] = value
  }
  await Promise.all(
    Object.entries(operationalStores).map(([name, store]) => store.put(operationalData[name]))
  )

  ctx.body = { ok: true, restoredAt: new Date().toISOString(), sourceCreatedAt: backup.createdAt }
})

router.get('/:id', async (ctx) => {
  try {
    const backup = await readBackup(ctx.params.id)
    ctx.type = 'application/json'
    ctx.attachment(ctx.params.id)
    ctx.set('X-Keepit-Backup-Created-At', backup.createdAt)
    ctx.body = createReadStream(resolveBackupFile(ctx.params.id))
  } catch (error) {
    ctx.status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400
    ctx.body = { error: ctx.status === 404 ? 'Back-up niet gevonden' : 'Ongeldige back-up' }
  }
})

export default router.routes()
