import { Router } from '@koa/router'
import { createReadStream } from 'fs'
import { automaticRetention, backupMirrorEnabled, createBackup, listBackups, readBackup, resolveBackupFile, scheduleAutomaticBackup, validateBackup } from '../helpers/backups.js'
import { operationalData, operationalStores } from '../database/database.js'
import { hasRole } from '../helpers/roles.js'
import pubsub from '../helpers/pubsub.js'
import { persistRestore, restoreGuard } from '../helpers/restore-guard.js'
import { clearScheduledPlanningNotifications } from '../helpers/planning-notifications.js'

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
  ctx.body = { backups: await listBackups(), automaticRetention, backupMirrorEnabled }
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

  const restore = restoreGuard.beginRestore()
  if (!restore) {
    ctx.status = 409
    ctx.body = { error: 'Er loopt al een herstel.' }
    return
  }
  try {
    await restore.ready
    let safetyBackup
    let safetyId: string
    try {
      const summary = await createBackup('pre-restore')
      safetyId = summary.id
      safetyBackup = await readBackup(safetyId)
    } catch (error) {
      console.error('Pre-restore backup failed:', error)
      ctx.status = 500
      ctx.body = { error: 'De veiligheidskopie kon niet worden gemaakt. Er zijn geen gegevens vervangen.' }
      return
    }
    const result = await persistRestore(
      Object.keys(operationalStores), backup.datasets, safetyBackup.datasets,
      (name, data) => operationalStores[name].put(data, { silent: true })
    )
    if (result.restored === false) {
      const incomplete = result.failedRollback.length > 0
      if (incomplete) console.error('Incomplete backup rollback:', safetyId, result.failedRollback)
      ctx.status = 500
      ctx.body = {
        error: incomplete
          ? `Herstel mislukt en de oorspronkelijke gegevens konden niet volledig worden teruggezet. Gebruik veiligheidskopie ${safetyId} en neem contact op met de beheerder.`
          : 'Herstel mislukt. De oorspronkelijke gegevens zijn teruggezet.',
        safetyBackupId: safetyId
      }
      return
    }
    for (const [name, target] of Object.entries(operationalData)) {
      for (const key of Object.keys(target)) delete target[key]
      Object.assign(target, backup.datasets[name])
    }
    clearScheduledPlanningNotifications()
    for (const [name, target] of Object.entries(operationalData)) pubsub.publish(`${name}.changed`, target)
    scheduleAutomaticBackup()
    ctx.body = { ok: true, restoredAt: new Date().toISOString(), sourceCreatedAt: backup.createdAt }
  } finally {
    restore.release()
  }
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
