import { Router } from '@koa/router'
import { companies, companiesStore, invoices, jobs } from '../database/database.js'
import { companyLinks } from '../helpers/business-links.js'
import { Company, Place } from '../../types/index.js'

type CreateCompanyBody = {
  name?: string
  description?: string
  logo?: string
  place?: Place
  uuid?: string
  relationshipType?: 'customer' | 'supplier'
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
  const { description, logo, place } = body
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!name || !place?.id || !place.formattedAddress) {
    ctx.status = 400
    ctx.body = { error: 'Vul een naam in en kies een geldig adres.' }
    return
  }

  const company: Company = {
    name,
    description: description || '',
    logo: logo || '',
    place,
    relationshipType: body.relationshipType === 'supplier' ? 'supplier' : 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const uuid = body.uuid || crypto.randomUUID()
  if (typeof uuid !== 'string' || Object.hasOwn(companies, uuid) || uuid in Object.prototype) {
    ctx.status = 409
    ctx.body = { error: 'Er bestaat al een relatie met dit ID of het ID is ongeldig.' }
    return
  }

  companies[uuid] = company
  await companiesStore.put(companies)

  ctx.body = { content: company, uuid }
  ctx.status = 201
  ctx.set('Content-Type', 'application/json')
})

router.patch('/:uuid', async (ctx) => {
  const current = Object.hasOwn(companies, ctx.params.uuid) ? companies[ctx.params.uuid] : undefined
  if (!current) {
    ctx.status = 404
    ctx.body = { error: 'Company not found' }
    return
  }

  const body = (ctx.request.body || {}) as Partial<CreateCompanyBody>
  if (body.place && (!body.place.id || !body.place.formattedAddress)) {
    ctx.status = 400
    ctx.body = { error: 'Kies een geldig adres uit de zoekresultaten.' }
    return
  }
  const relationshipType =
    body.relationshipType === 'supplier' || body.relationshipType === 'customer'
      ? body.relationshipType
      : current.relationshipType
  if (relationshipType === 'supplier' && current.relationshipType !== 'supplier' && companyLinks(ctx.params.uuid, jobs, invoices).jobs) {
    ctx.status = 409
    ctx.body = { error: 'Deze klant is nog gekoppeld aan jobs. Kies daar eerst een andere klant of verwijder de koppeling.' }
    return
  }
  const updated = {
    ...current,
    ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
    ...(typeof body.description === 'string' ? { description: body.description.trim() } : {}),
    ...(typeof body.logo === 'string' ? { logo: body.logo } : {}),
    ...(body.place ? { place: body.place } : {}),
    relationshipType,
    updatedAt: new Date().toISOString()
  }
  companies[ctx.params.uuid] = updated
  await companiesStore.put(companies)
  ctx.body = updated
})

router.delete('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  if (!Object.hasOwn(companies, uuid)) {
    ctx.status = 404
    ctx.body = { error: 'Company not found' }
    return
  }
  const links = companyLinks(uuid, jobs, invoices)
  if (links.jobs || links.invoices) {
    ctx.status = 409
    ctx.body = {
      error: 'Deze relatie is nog in gebruik.',
      message: `Verwijderen kan niet: deze relatie is gekoppeld aan ${[
        links.jobs && `${links.jobs} job${links.jobs === 1 ? '' : 's'}`,
        links.invoices && `${links.invoices} ${links.invoices === 1 ? 'factuur' : 'facturen'}`
      ].filter(Boolean).join(' en ')}.`
    }
    return
  }

  const previous = companies[uuid]
  delete companies[uuid]
  try {
    await companiesStore.put(companies)
  } catch (err) {
    companies[uuid] = previous
    ctx.status = 500
    ctx.body = { error: 'Failed to persist company deletion' }
    return
  }

  ctx.status = 204
})

export default router.routes()
