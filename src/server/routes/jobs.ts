import Router from '@koa/router'
import { jobs, jobsStore } from './../database/database.js'
import { Place } from '../../types/index.js'

const router = new Router({
  prefix: '/api/jobs'
})

router.get('/', async (ctx) => {
  ctx.body = jobs
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/', async (ctx) => {
  const body = (ctx.request.body || {}) as {
    name?: string
    description?: string
    place?: Place
    uuid?: string
  }

  const { name, description, place } = body

  if (!name || !place) {
    ctx.status = 400
    ctx.body = { error: 'Missing required fields' }
    return
  }

  const uuid = body.uuid || crypto.randomUUID()

  const job = {
    name,
    description: description || '',
    hours: {},
    materials: [],
    place,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  jobs[uuid] = job

  await jobsStore.put(jobs)

  ctx.body = { uuid, content: job }
  ctx.status = 201
  ctx.set('Content-Type', 'application/json')
})

router.delete('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  delete jobs[uuid]
  await jobsStore.put(jobs)
  ctx.status = 204
})

export default router.routes()
