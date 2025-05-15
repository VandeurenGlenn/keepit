import Router from '@koa/router'
import { jobs, jobsStore } from './../database/database.js'

const router = new Router({
  prefix: '/api/jobs'
})

router.get('/', async (ctx) => {
  ctx.body = jobs
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/', async (ctx) => {
  const { name, description, place } = ctx.request.body
  const uuid = ctx.request.body.uuid || crypto.randomUUID()

  const job = { name, description, place, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
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
