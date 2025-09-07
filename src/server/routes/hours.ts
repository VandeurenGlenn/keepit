import Router from '@koa/router'
import { jobs, jobsStore, hours, hoursStore, users, usersStore } from './../database/database.js'
import serve from 'koa-static'
import { Prestation } from '../../types/index.js'

const router = new Router({
  prefix: '/api/hours'
})

router.post('/checkin', async (ctx) => {
  const { job, userId, checkin, date } = ctx.request.body || {}
  if (!job || !userId) {
    ctx.status = 400
    ctx.body = { error: 'job and userId are required' }
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
  console.log('checkin', job, userId, checkin, date)

  const prestationId = crypto.randomUUID()
  const prestation: Prestation = {
    description: '',
    duration: 0,
    checkin,
    serverCheckin: Date.now(),
    jobId: job
  }

  if (!hours[userId]) {
    hours[userId] = { [prestationId]: prestation }
  } else {
    hours[userId][prestationId] = prestation
  }

  users[userId].currentJob = job

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
  const { job, userId, checkout, date } = ctx.request.body || {}
  if (!job || !userId) {
    ctx.status = 400
    ctx.body = { error: 'job and userId are required' }
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

  const prestations = jobs[job].hours[userId]
  if (!prestations) {
    ctx.status = 404
    ctx.body = { error: 'Prestations not found' }
    return
  }

  const prestationId = prestations[prestations.length - 1]

  const prestation = hours[userId][prestationId]
  prestation.checkout = checkout
  prestation.serverCheckout = Date.now()
  // compute duration in ms, prefer client-provided timestamps when available
  try {
    const checkinTs =
      typeof prestation.checkin === 'number' ? prestation.checkin : new Date(prestation.checkin).getTime()
    const checkoutTs = typeof checkout === 'number' ? checkout : new Date(checkout).getTime()
    if (!Number.isNaN(checkinTs) && !Number.isNaN(checkoutTs)) {
      prestation.duration = Math.max(0, checkoutTs - checkinTs)
    }
  } catch (e) {
    // ignore duration computation errors
  }

  users[userId].currentJob = null

  try {
    const promises: Promise<any>[] = [hoursStore.put(hours), usersStore.put(users)]
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
