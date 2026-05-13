import Router from '@koa/router'
import { jobs, jobsStore, hours, hoursStore, users, usersStore } from './../database/database.js'
import { Prestation } from '../../types/index.js'

const router = new Router({
  prefix: '/api/hours'
})

type CheckinBody = {
  job?: string
  userId?: string
  checkin?: number | string
}

type CheckoutBody = {
  job?: string
  userId?: string
  checkout?: number | string
}

const toTimestamp = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
    const dateParsed = new Date(value).getTime()
    if (!Number.isNaN(dateParsed)) return dateParsed
  }
  return Number.NaN
}

router.get('/job/:id', async (ctx) => {
  const jobId = ctx.params.id
  const billableOnly = `${ctx.query.billableOnly || ''}`.toLowerCase() === 'true'
  if (!jobId || !jobs[jobId]) {
    ctx.status = 404

    ctx.body = { error: 'Job not found' }
    return
  }
  const job = jobs[jobId]
  const jobHoursByUser = job.hours || {}
  const jobHours: { [userId: string]: Prestation[] } = {}
  for (const [userId, prestationIds] of Object.entries(jobHoursByUser)) {
    const userHours = hours[userId] || {}
    jobHours[userId] = prestationIds
      .map((id) => userHours[id])
      .filter((prestation): prestation is Prestation => {
        if (!prestation) return false
        if (!billableOnly) return true
        const hasCheckout = typeof prestation.checkout === 'number' && Number.isFinite(prestation.checkout)
        const notInvoiced = !prestation.invoiceId && !prestation.invoicedAt
        return hasCheckout && notInvoiced
      })
  }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
  ctx.body = jobHours
  return
})

router.post('/checkin', async (ctx) => {
  const body = (ctx.request.body || {}) as CheckinBody
  const { job, userId, checkin } = body
  if (!job || !userId) {
    ctx.status = 400
    ctx.body = { error: 'job and userId are required' }
    return
  }
  if (!users[userId]) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  if (users[userId].currentJob) {
    ctx.status = 400
    ctx.body = {
      error: 'You need to checkout first.',
      currentJob: users[userId].currentJob,
      steps: ['checkout other job', 'checkin new job']
    }
    return
  }

  const checkinTs = toTimestamp(checkin)
  if (Number.isNaN(checkinTs)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid checkin value' }
    return
  }

  const prestationId = crypto.randomUUID()
  const prestation: Prestation = {
    description: '',
    duration: 0,
    checkin: checkinTs,
    serverCheckin: Date.now(),
    jobId: job
  }

  if (!hours[userId]) {
    hours[userId] = { [prestationId]: prestation }
  } else {
    hours[userId][prestationId] = prestation
  }

  users[userId].currentJob = job

  jobs[job].hours = jobs[job].hours || {}
  jobs[job].hours[userId] = jobs[job].hours[userId] || []
  jobs[job].hours[userId].push(prestationId)

  try {
    await Promise.all([jobsStore.put(jobs), hoursStore.put(hours), usersStore.put(users)])
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
    ctx.body = prestation
    return
  } catch (err) {
    console.error('failed to persist checkin', err)
    ctx.status = 500
    ctx.body = { error: 'failed to persist checkin' }
    return
  }
})

router.post('/checkout', async (ctx) => {
  const body = (ctx.request.body || {}) as CheckoutBody
  const { job, userId, checkout } = body
  if (!job || !userId) {
    ctx.status = 400
    ctx.body = { error: 'job and userId are required' }
    return
  }
  if (!users[userId]) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }

  if (users[userId].currentJob !== job) {
    ctx.status = 400
    ctx.body = { error: 'User is not currently working on this job' }
    return
  }

  jobs[job].updatedAt = new Date().toISOString()

  const prestations = jobs[job].hours?.[userId]
  if (!prestations || prestations.length === 0) {
    ctx.status = 404
    ctx.body = { error: 'Prestations not found' }
    return
  }

  const prestationId = prestations[prestations.length - 1]

  const prestation = hours[userId]?.[prestationId]
  if (!prestation) {
    ctx.status = 404
    ctx.body = { error: 'Prestation not found' }
    return
  }

  if (prestation.checkout) {
    ctx.status = 400
    ctx.body = { error: 'This prestation is already checked out' }
    return
  }

  const checkoutTs = toTimestamp(checkout)
  if (Number.isNaN(checkoutTs)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid checkout value' }
    return
  }

  prestation.checkout = checkoutTs
  prestation.serverCheckout = Date.now()
  const checkinTs = toTimestamp(prestation.checkin)
  if (!Number.isNaN(checkinTs)) {
    prestation.duration = Math.max(0, checkoutTs - checkinTs)
  }

  users[userId].currentJob = undefined

  try {
    const promises: Promise<unknown>[] = [jobsStore.put(jobs), hoursStore.put(hours), usersStore.put(users)]
    await Promise.all(promises)
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
    ctx.body = prestation
    return
  } catch (err) {
    console.error('failed to persist checkout', err)
    ctx.status = 500
    ctx.body = { error: 'failed to persist checkout' }
    return
  }
})

export default router.routes()
