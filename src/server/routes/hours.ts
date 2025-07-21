import Router from '@koa/router'
import { jobs, jobsStore } from './../database/database.js'
import serve from 'koa-static'

const router = new Router({
  prefix: '/api/hours'
})

router.get('/:job/:userId', async (ctx) => {
  const job = ctx.params.job
  const userId = ctx.params.userId
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  if (!jobs[job].hours[userId]) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  ctx.body = jobs[job].hours[userId]
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
  return
})

router.get('/:job', async (ctx) => {
  const job = ctx.params.job
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  ctx.body = jobs[job].hours
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')

  return
})

router.post('/checkin', async (ctx) => {
  const { job, userId, checkin, date } = ctx.request.body
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  console.log('checkin', job, userId, checkin, date)

  if (!jobs[job].hours) {
    jobs[job].hours = {}
  }
  if (!jobs[job].hours[date]) {
    jobs[job].hours[date] = {}
  }
  jobs[job].hours[date][userId] = {
    checkin,
    serverCheckin: Date.now()
  }

  await jobsStore.put(jobs)
  ctx.status = 200
  return
})

router.post('/checkout', async (ctx) => {
  const { job, userId, checkout, date } = ctx.request.body
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  jobs[job].hours[date][userId].checkout = checkout
  jobs[job].hours[date][userId].serverCheckout = Date.now()

  await jobsStore.put(jobs)
  ctx.status = 200
  return
})

export default router.routes()
