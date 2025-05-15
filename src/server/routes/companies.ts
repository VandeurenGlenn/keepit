import Router from '@koa/router'
import { companies, companiesStore } from '../database/database.js'
import isUser from '../middleware/is-user.js'
import { isAuthenticated } from '../middleware/is-authenticated.js'

const router = new Router({
  prefix: '/api/companies'
})

router.use(isAuthenticated)
router.use(isUser)

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

export default router.routes()
