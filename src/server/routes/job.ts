import { Router } from '@koa/router'

import { companies, hours, jobs, planning, users } from './../database/database.js'
import { jobsStore } from './../database/database.js'
import { hasRole } from '../helpers/roles.js'
import { jobArchiveBlockers } from '../helpers/business-links.js'
import { appendJobNote } from '../helpers/job-notes.js'

const router = new Router({
  prefix: '/api/job'
})

router.post('/:uuid/notes', async (ctx) => {
  const id = ctx.params.uuid
  const job = Object.hasOwn(jobs, id) ? jobs[id] : undefined
  const actor = ctx.state.userid as string
  const user = Object.hasOwn(users, actor) ? users[actor] : undefined
  if (!user) {
    ctx.status = 403
    ctx.body = { error: 'Meld je aan om een notitie toe te voegen.' }
    return
  }
  if (!job) {
    ctx.status = 404
    ctx.body = { error: 'Job niet gevonden.' }
    return
  }
  const body = (ctx.request.body || {}) as { id?: unknown; text?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (typeof body.id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.id) ||
      !text || text.length > 4000) {
    ctx.status = 400
    ctx.body = { error: 'Schrijf een notitie van maximaal 4000 tekens.' }
    return
  }
  const now = new Date().toISOString()
  const result = appendJobNote(job.notes || [], { id: body.id, text, createdAt: now, author: actor, authorName: user.name })
  if (!result) {
    ctx.status = 409
    ctx.body = { error: 'Deze notitie kon niet opnieuw worden ingediend.' }
    return
  }
  if (result.created) {
    job.notes = result.notes
    job.updatedAt = now
  }
  // Retry persistence even when the ID already exists: the previous write may have failed.
  await jobsStore.put(jobs)
  ctx.status = result.created ? 201 : 200
  ctx.body = { notes: jobs[id].notes || [] }
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
    ? ['name', 'description', 'place', 'customerId', 'images', 'materials', 'materialDiscountPercent', 'status', 'archivedAt']
    : ['materials', 'materialDiscountPercent', 'images']
  if ('notes' in payload) {
    ctx.status = 409
    ctx.body = { error: 'Vernieuw Keepit om een notitie toe te voegen.' }
    return
  }
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
