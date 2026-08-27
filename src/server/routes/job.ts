import { Router } from '@koa/router'

import { hours, jobs, planning } from './../database/database.js'
import { jobsStore } from './../database/database.js'
import { hasRole } from '../helpers/roles.js'

const router = new Router({
  prefix: '/api/job'
})

router.get('/:uuid/completion-check', async (ctx) => {
  const job = jobs[ctx.params.uuid]
  if (!job) { ctx.status = 404; ctx.body = { error: 'Job not found' }; return }
  const prestations = Object.entries(job.hours || {}).flatMap(([userId, ids]) => ids.map((id) => hours[userId]?.[id]).filter(Boolean))
  const open = prestations.filter((item) => !item.checkout).length
  const uninvoiced = prestations.filter((item) => item.checkout && !item.invoiceId && !item.invoicedAt).length
  const futurePlanning = Object.values(planning).filter((item) => item.jobId === ctx.params.uuid && Date.parse(item.end) > Date.now()).length
  const issues = [
    open ? { kind: 'open-hours' as const, message: `${open} openstaande urenregistratie(s)`, blocking: true } : undefined,
    uninvoiced ? { kind: 'uninvoiced-hours' as const, message: `${uninvoiced} nog niet gefactureerde urenregistratie(s)`, blocking: false } : undefined,
    !job.materials?.length ? { kind: 'materials' as const, message: 'Geen materialen geregistreerd', blocking: false } : undefined,
    !job.notes?.length ? { kind: 'notes' as const, message: 'Geen notities toegevoegd', blocking: false } : undefined,
    !job.images?.length ? { kind: 'images' as const, message: 'Geen werffoto’s toegevoegd', blocking: false } : undefined,
    futurePlanning ? { kind: 'planning' as const, message: `${futurePlanning} toekomstige planning(en)`, blocking: true } : undefined
  ].filter(Boolean)
  ctx.body = { ready: !issues.some((item) => item?.blocking), issues }
})

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  if (!jobs[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  ctx.body = jobs[uuid]
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.patch('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  const payload = (ctx.request.body || {}) as Record<string, unknown>
  if (!jobs[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }

  const allowed = hasRole(ctx.state.userid, 'admin')
    ? ['name', 'description', 'place', 'images', 'materials', 'notes', 'status', 'archivedAt']
    : ['materials', 'notes', 'images']
  const updates = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)))
  if (!Object.keys(updates).length) { ctx.status = 403; ctx.body = { error: 'Geen toegelaten wijzigingen' }; return }
  jobs[uuid] = { ...jobs[uuid], ...updates, updatedAt: new Date().toISOString() }

  try {
    await jobsStore.put(jobs)
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: 'Failed to persist job' }
    return
  }

  ctx.status = 200
  ctx.body = jobs[uuid]
})

export default router.routes()
