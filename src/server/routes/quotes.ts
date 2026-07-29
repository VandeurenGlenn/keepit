import Router from '@koa/router'
import { jobs, quotes, quotesStore } from '../database/database.js'
import type { MaterialLine, Quote, QuoteStatus } from '../../types/index.js'

const router = new Router({ prefix: '/api/quotes' })
const statuses: QuoteStatus[] = ['draft', 'sent', 'approved', 'rejected']

type QuoteInput = Partial<Pick<Quote, 'name' | 'description' | 'jobId' | 'status' | 'materials' | 'notes' | 'validUntil'>>

const optionalText = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().slice(0, maxLength)
  return normalized || undefined
}

const normalizeMaterials = (value: unknown): MaterialLine[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap((item): MaterialLine[] => {
    const name = optionalText(item?.name, 500)
    const quantity = Number(item?.quantity)
    const price = item?.unitPrice === undefined || item?.unitPrice === null ? undefined : Number(item.unitPrice)
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || (price !== undefined && (!Number.isFinite(price) || price < 0))) return []

    return [{
      name,
      quantity,
      unit: optionalText(item?.unit, 60),
      unitPrice: price,
      articleNumber: optionalText(item?.articleNumber, 120),
      productNumber: optionalText(item?.productNumber, 120),
      packagingQuantity: Number.isFinite(Number(item?.packagingQuantity)) ? Number(item.packagingQuantity) : undefined,
      description: optionalText(item?.description, 2000),
      image: optionalText(item?.image, 2000),
      technicalData: item?.technicalData && typeof item.technicalData === 'object' ? item.technicalData : undefined,
      manufacturerData: item?.manufacturerData && typeof item.manufacturerData === 'object' ? item.manufacturerData : undefined,
      dataSources: Array.isArray(item?.dataSources) ? item.dataSources : undefined,
      imageCandidates: Array.isArray(item?.imageCandidates) ? item.imageCandidates : undefined
    }]
  })
}

const validate = (input: QuoteInput): string | undefined => {
  if (!optionalText(input.name, 180)) return 'Geef de offerte een naam'
  if (!input.jobId || !jobs[input.jobId]) return 'Kies een geldige job'
  if (input.status && !statuses.includes(input.status)) return 'Kies een geldige status'
  if (input.validUntil && !Number.isFinite(Date.parse(input.validUntil))) return 'Kies een geldige vervaldatum'
  if (!Array.isArray(input.materials) || normalizeMaterials(input.materials).length !== input.materials.length) {
    return 'Controleer de materiaalregels'
  }
}

const quoteFromInput = (input: QuoteInput, current?: Quote): Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> => ({
  name: optionalText(input.name, 180)!,
  description: optionalText(input.description, 2000),
  jobId: input.jobId!,
  status: input.status || current?.status || 'draft',
  materials: normalizeMaterials(input.materials),
  notes: optionalText(input.notes, 5000),
  validUntil: input.validUntil ? new Date(input.validUntil).toISOString().slice(0, 10) : undefined
})

router.get('/', (ctx) => {
  ctx.body = quotes
})

router.get('/:id', (ctx) => {
  const quote = quotes[ctx.params.id]
  if (!quote) {
    ctx.status = 404
    ctx.body = { error: 'Offerte niet gevonden' }
    return
  }
  ctx.body = quote
})

router.post('/', async (ctx) => {
  const input = (ctx.request.body || {}) as QuoteInput
  const error = validate(input)
  if (error) {
    ctx.status = 400
    ctx.body = { error }
    return
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const quote: Quote = {
    ...quoteFromInput(input),
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.state.userid
  }
  quotes[id] = quote
  await quotesStore.put(quotes)
  ctx.status = 201
  ctx.body = quote
})

router.patch('/:id', async (ctx) => {
  const current = quotes[ctx.params.id]
  if (!current) {
    ctx.status = 404
    ctx.body = { error: 'Offerte niet gevonden' }
    return
  }
  const input = { ...current, ...((ctx.request.body || {}) as QuoteInput) }
  const error = validate(input)
  if (error) {
    ctx.status = 400
    ctx.body = { error }
    return
  }
  const updated: Quote = { ...current, ...quoteFromInput(input, current), updatedAt: new Date().toISOString() }
  quotes[current.id] = updated
  await quotesStore.put(quotes)
  ctx.body = updated
})

router.post('/:id/duplicate', async (ctx) => {
  const current = quotes[ctx.params.id]
  if (!current) {
    ctx.status = 404
    ctx.body = { error: 'Offerte niet gevonden' }
    return
  }
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const duplicate: Quote = {
    ...structuredClone(current),
    id,
    name: `${current.name} (kopie)`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.state.userid
  }
  quotes[id] = duplicate
  await quotesStore.put(quotes)
  ctx.status = 201
  ctx.body = duplicate
})

router.delete('/:id', async (ctx) => {
  if (!quotes[ctx.params.id]) {
    ctx.status = 404
    ctx.body = { error: 'Offerte niet gevonden' }
    return
  }
  delete quotes[ctx.params.id]
  await quotesStore.put(quotes)
  ctx.status = 204
})

export default router.routes()
