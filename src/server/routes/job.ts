import { Router } from '@koa/router'

import { companies, hours, jobs, planning } from './../database/database.js'
import { jobsStore } from './../database/database.js'
import { hasRole } from '../helpers/roles.js'
import { jobArchiveBlockers } from '../helpers/business-links.js'

const router = new Router({
  prefix: '/api/job'
})

router.get('/:uuid/completion-check', async (ctx) => {
  const job = jobs[ctx.params.uuid]
  if (!job) { ctx.status = 404; ctx.body = { error: 'Job not found' }; return }
  const prestations = Object.entries(job.hours || {}).flatMap(([userId, ids]) => ids.map((id) => hours[userId]?.[id]).filter(Boolean))
  const uninvoiced = prestations.filter((item) => item.checkout && !item.invoiceId && !item.invoicedAt).length
  const blockers = jobArchiveBlockers(ctx.params.uuid, hours, planning)
  const issues = [
    ...blockers,
    uninvoiced ? { kind: 'uninvoiced-hours' as const, message: `${uninvoiced} nog niet gefactureerde urenregistratie(s)`, blocking: false } : undefined,
    !job.materials?.length ? { kind: 'materials' as const, message: 'Geen materialen geregistreerd', blocking: false } : undefined,
    !job.notes?.length ? { kind: 'notes' as const, message: 'Geen notities toegevoegd', blocking: false } : undefined,
    !job.images?.length ? { kind: 'images' as const, message: 'Geen werffoto’s toegevoegd', blocking: false } : undefined
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
    ? ['name', 'description', 'place', 'customerId', 'images', 'materials', 'materialDiscountPercent', 'notes', 'status', 'archivedAt']
    : ['materials', 'materialDiscountPercent', 'notes', 'images']
  const updates = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)))
  if (!Object.keys(updates).length) { ctx.status = 403; ctx.body = { error: 'Geen toegelaten wijzigingen' }; return }
  if (updates.status === 'completed' || updates.archivedAt) {
    const blockers = jobArchiveBlockers(uuid, hours, planning)
    if (blockers.length) {
      ctx.status = 409
      ctx.body = { error: `Deze job kan nog niet worden gearchiveerd: ${blockers.map((issue) => issue.message).join(' · ')}.` }
      return
    }
  }
  if (updates.status === 'active') updates.archivedAt = undefined
  if ('place' in updates) {
    const place = updates.place as { id?: unknown; formattedAddress?: unknown } | undefined
    if (!place?.id || !place.formattedAddress) {
      ctx.status = 400
      ctx.body = { error: 'Kies een geldig werfadres uit de zoekresultaten.' }
      return
    }
  }
  if ('customerId' in updates) {
    const customerId = String(updates.customerId || '').trim()
    if (customerId && (!Object.hasOwn(companies, customerId) || companies[customerId].relationshipType === 'supplier')) {
      ctx.status = 400
      ctx.body = { error: 'Kies een geldige klant.' }
      return
    }
    updates.customerId = customerId || undefined
  }
  if ('materialDiscountPercent' in updates) {
    const discount = Number(updates.materialDiscountPercent)
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      ctx.status = 400
      ctx.body = { error: 'De materiaalkorting moet tussen 0 en 100 procent liggen.' }
      return
    }
    updates.materialDiscountPercent = discount
  }
  jobs[uuid] = { ...jobs[uuid], ...updates, updatedAt: new Date().toISOString() }
  if (!jobs[uuid].customerId) delete jobs[uuid].customerId

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
