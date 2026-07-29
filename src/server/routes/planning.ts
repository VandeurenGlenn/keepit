import Router from '@koa/router'
import { jobs, planning, planningStore, users } from '../database/database.js'
import type { PlanningEntry } from '../../types/index.js'
import {
  cancelScheduledPlanningNotification,
  notifyPlanningUsers,
  schedulePlanningUpdateNotification
} from '../helpers/planning-notifications.js'

const router = new Router({ prefix: '/api/planning' })

type PlanningInput = Partial<Pick<PlanningEntry, 'jobId' | 'userIds' | 'start' | 'end' | 'notes'>>

const validate = (input: PlanningInput): string | undefined => {
  if (!input.jobId || !jobs[input.jobId]) return 'Kies een geldige job'
  if (!Array.isArray(input.userIds) || input.userIds.length === 0) return 'Kies minstens één medewerker'
  if (input.userIds.some((id) => !users[id])) return 'Een geselecteerde medewerker bestaat niet meer'

  const start = Date.parse(input.start || '')
  const end = Date.parse(input.end || '')
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Kies een geldige begin- en eindtijd'
  if (end <= start) return 'De eindtijd moet na de begintijd liggen'
  if ((input.notes?.length || 0) > 1000) return 'Notities mogen maximaal 1000 tekens bevatten'
}

router.get('/', async (ctx) => {
  const from = Date.parse(String(ctx.query.from || ''))
  const to = Date.parse(String(ctx.query.to || ''))

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    ctx.status = 400
    ctx.body = { error: 'Geef een geldige periode op' }
    return
  }

  ctx.body = Object.values(planning)
    .filter((entry) => Date.parse(entry.start) < to && Date.parse(entry.end) > from)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
})

router.post('/', async (ctx) => {
  const input = (ctx.request.body || {}) as PlanningInput
  input.userIds = Array.isArray(input.userIds) ? [...new Set(input.userIds)] : input.userIds
  const error = validate(input)
  if (error) {
    ctx.status = 400
    ctx.body = { error }
    return
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const entry: PlanningEntry = {
    id,
    jobId: input.jobId!,
    userIds: input.userIds!,
    start: new Date(input.start!).toISOString(),
    end: new Date(input.end!).toISOString(),
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.state.userid
  }
  planning[id] = entry
  await planningStore.put(planning)
  await notifyPlanningUsers(entry, 'created')
  ctx.status = 201
  ctx.body = entry
})

router.patch('/:id', async (ctx) => {
  const current = planning[ctx.params.id]
  if (!current) {
    ctx.status = 404
    ctx.body = { error: 'Planning niet gevonden' }
    return
  }

  const body = (ctx.request.body || {}) as PlanningInput
  const merged: PlanningInput = { ...current, ...body }
  merged.userIds = Array.isArray(merged.userIds) ? [...new Set(merged.userIds)] : merged.userIds
  const error = validate(merged)
  if (error) {
    ctx.status = 400
    ctx.body = { error }
    return
  }

  const updated: PlanningEntry = {
    ...current,
    jobId: merged.jobId!,
    userIds: merged.userIds!,
    start: new Date(merged.start!).toISOString(),
    end: new Date(merged.end!).toISOString(),
    notes: merged.notes?.trim() || undefined,
    updatedAt: new Date().toISOString()
  }
  planning[current.id] = updated
  await planningStore.put(planning)
  schedulePlanningUpdateNotification(current, updated)
  ctx.body = updated
})

router.delete('/:id', async (ctx) => {
  if (!planning[ctx.params.id]) {
    ctx.status = 404
    ctx.body = { error: 'Planning niet gevonden' }
    return
  }
  const removed = planning[ctx.params.id]
  cancelScheduledPlanningNotification(removed.id)
  delete planning[ctx.params.id]
  await planningStore.put(planning)
  await notifyPlanningUsers(removed, 'cancelled')
  ctx.status = 204
})

export default router.routes()
