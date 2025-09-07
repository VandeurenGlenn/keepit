import Router from '@koa/router'

import { jobs } from './../database/database.js'
import { jobsStore } from './../database/database.js'

const router = new Router({
  prefix: '/api/job'
})

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  ctx.body = jobs[uuid] || {}
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
  const payload = ctx.request.body || {}
  if (!jobs[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }

  // merge shallow - keep existing structure unless overwritten
  jobs[uuid] = { ...jobs[uuid], ...payload, updatedAt: new Date().toISOString() }

  try {
    await jobsStore.put(jobs)
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: 'Failed to persist job' }
    return
  }

  ctx.status = 200
  ctx.body = { uuid, content: jobs[uuid] }
})

export default router.routes()
