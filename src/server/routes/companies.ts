import Router from '@koa/router'
import { companies, companiesStore } from '../database/database.js'

const router = new Router({
  prefix: '/api/companies'
})

router.get('/', async (ctx) => {
  ctx.body = companies
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/', async (ctx) => {
  const { name, description, logo, place } = ctx.request.body
  const company = {
    name,
    description,
    logo,
    place,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const uuid = ctx.request.body.uuid || crypto.randomUUID()

  companies[uuid] = company
  await companiesStore.put(companies)

  ctx.body = { content: company, uuid }
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
  if (!companies[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'Company not found' }
    return
  }

  delete companies[uuid]
  try {
    await companiesStore.put(companies)
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: 'Failed to persist company deletion' }
    return
  }

  ctx.status = 204
})

export default router.routes()
