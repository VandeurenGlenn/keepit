import { Router } from '@koa/router'
import { jobs, jobsStore } from './../database/database.js'
import { Place } from '../../types/index.js'
import { hasRole } from '../helpers/roles.js'

const router = new Router({
  prefix: '/api/jobs'
})

router.get('/', async (ctx) => {
  ctx.body = jobs
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/', async (ctx) => {
  if (!hasRole(ctx.state.userid, 'admin')) { ctx.status = 403; ctx.body = { error: 'Alleen admins kunnen jobs aanmaken' }; return }
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
  if (!hasRole(ctx.state.userid, 'admin')) { ctx.status = 403; ctx.body = { error: 'Alleen admins kunnen jobs archiveren' }; return }
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  if (!jobs[uuid]) { ctx.status = 404; ctx.body = { error: 'Job not found' }; return }
  jobs[uuid].status = 'completed'
  jobs[uuid].archivedAt = new Date().toISOString()
  jobs[uuid].updatedAt = new Date().toISOString()
  await jobsStore.put(jobs)
  ctx.body = jobs[uuid]
})

export default router.routes()
