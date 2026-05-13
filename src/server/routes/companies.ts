import Router from '@koa/router'
import { companies, companiesStore } from '../database/database.js'
import { Place } from '../../types/index.js'

type CreateCompanyBody = {
  name?: string
  description?: string
  logo?: string
  place?: Place
  uuid?: string
}

const router = new Router({
  prefix: '/api/companies'
})

router.get('/', async (ctx) => {
  ctx.body = companies
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/', async (ctx) => {
  const body = (ctx.request.body || {}) as CreateCompanyBody
  const { name, description, logo, place } = body

  if (!name || !description || !logo || !place) {
    ctx.status = 400
    ctx.body = { error: 'Missing required fields' }
    return
  }

  const company = {
    name,
    description,
    logo,
    place,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const uuid = body.uuid || crypto.randomUUID()

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
