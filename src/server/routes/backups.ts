import { Router } from '@koa/router'
import { createReadStream } from 'fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { automaticRetention, backupMirrorEnabled, captureBackup, createBackup, getBackupSummary, listBackups, readBackup, resolveBackupFile, scheduleAutomaticBackup, validateBackup } from '../helpers/backups.js'
import { installBackupAttachments, stageBackupArchive } from '../helpers/backup-archive.js'
import { databasePath, databaseRoot } from '../helpers/paths.js'
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
  const isUpload = Boolean(ctx.is('application/x-tar'))
  const body = (ctx.request.body || {}) as { backup?: unknown; backupId?: string; confirmation?: string }
  if ((isUpload ? ctx.get('X-Keepit-Confirmation') : body.confirmation) !== 'HERSTEL') {
    ctx.status = 400
    ctx.body = { error: 'Bevestig het herstel met HERSTEL' }
    return
  }
  if (restoreGuard.isRestoring()) {
    ctx.status = 409
    ctx.body = { error: 'Er loopt al een herstel.' }
    return
  }

  let backup
  let staging: string | undefined
  let keepStaging = false
  const cleanup = async () => {
    if (staging && !keepStaging) await rm(staging, { recursive: true, force: true }).catch((error) => {
      console.error('Unable to remove backup staging directory:', error)
    })
  }
  try {
    const selectedPath = typeof body.backupId === 'string' ? resolveBackupFile(body.backupId) : undefined
    if (isUpload || (selectedPath && body.backupId.endsWith('.tar'))) {
      staging = await mkdtemp(databasePath('.restore-'))
      const source = isUpload ? Readable.from(ctx.req.iterator({ destroyOnReturn: false })) : createReadStream(selectedPath)
      backup = await stageBackupArchive(source, staging, validateBackup)
    } else {
      backup = selectedPath ? await readBackup(body.backupId) : validateBackup(body.backup)
    }
  } catch (error) {
    await cleanup()
    const code = (error as NodeJS.ErrnoException).code
    ctx.status = code === 'ENOENT' ? 404 : code === 'ENOSPC' || code === 'EACCES' ? 500 : 400
    ctx.body = { error: ctx.status === 500 ? 'Het archief kon niet tijdelijk op de server worden opgeslagen.' : 'De back-up ontbreekt, is ongeldig of is beschadigd.' }
    return
  }

  const restore = restoreGuard.beginRestore()
  if (!restore) {
    await cleanup()
    ctx.status = 409
    ctx.body = { error: 'Er loopt al een herstel.' }
    return
  }
  try {
    await restore.ready
    let safetyBackup
    let safetyId: string
    try {
      safetyBackup = await captureBackup('pre-restore')
      const summary = await createBackup('pre-restore', safetyBackup)
      safetyId = summary.id
    } catch (error) {
      console.error('Pre-restore backup failed:', error)
      ctx.status = 500
      ctx.body = { error: 'De veiligheidskopie kon niet worden gemaakt. Er zijn geen gegevens vervangen.' }
      return
    }
    let undoAttachments: (() => Promise<unknown[]>) | undefined
    if (staging) {
      try {
        undoAttachments = await installBackupAttachments(staging, databaseRoot)
      } catch (error) {
        keepStaging = error instanceof AggregateError
        console.error('Unable to install backup attachments:', error)
        ctx.status = 500
        ctx.body = {
          error: keepStaging
            ? `De bijlagen konden niet volledig worden teruggezet. Gebruik veiligheidskopie ${safetyId}.`
            : 'De bijlagen konden niet worden hersteld. Er zijn geen gegevens vervangen.',
          safetyBackupId: safetyId
        }
        return
      }
    }
    const result = await persistRestore(
      Object.keys(operationalStores), backup.datasets, safetyBackup.datasets,
      (name, data) => operationalStores[name].put(data, { silent: true })
    )
    if (result.restored === false) {
      const fileFailures = (await undoAttachments?.()) || []
      keepStaging = fileFailures.length > 0
      const incomplete = result.failedRollback.length > 0 || keepStaging
      if (incomplete) console.error('Incomplete backup rollback:', safetyId, result.failedRollback, fileFailures)
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
    ctx.body = { ok: true, restoredAt: new Date().toISOString(), sourceCreatedAt: backup.createdAt, restoredAttachments: Boolean(staging) }
  } finally {
    restore.release()
    await cleanup()
  }
})

router.get('/:id', async (ctx) => {
  try {
    const backup = await getBackupSummary(ctx.params.id)
    ctx.type = backup.includesAttachments ? 'application/x-tar' : 'application/json'
    ctx.length = backup.sizeBytes
    ctx.set('Cache-Control', 'private, no-store')
    ctx.attachment(ctx.params.id)
    ctx.set('X-Keepit-Backup-Created-At', backup.createdAt)
    ctx.body = createReadStream(resolveBackupFile(ctx.params.id))
  } catch (error) {
    ctx.status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400
    ctx.body = { error: ctx.status === 404 ? 'Back-up niet gevonden' : 'Ongeldige back-up' }
  }
})

export default router.routes()
