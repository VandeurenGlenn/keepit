import { Router } from '@koa/router'

import { invoices, invoicesStore } from '../database/database.js'
import { MaterialLine } from '../../types/index.js'

const router = new Router({
  prefix: '/api/invoice'
})

const normalizeMaterials = (value: unknown): MaterialLine[] => {
  if (!Array.isArray(value)) return []

  const normalized: MaterialLine[] = []

  for (const item of value) {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const quantity = Number(item?.quantity)
    const unit = typeof item?.unit === 'string' ? item.unit.trim() : ''
    const unitPriceRaw = item?.unitPrice
    const unitPrice =
      unitPriceRaw === undefined || unitPriceRaw === null || unitPriceRaw === '' ? undefined : Number(unitPriceRaw)

    if (!name) continue

    normalized.push({
      name,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: unit || undefined,
      unitPrice: unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined
    })
  }

  return normalized
}

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  ctx.body = invoices[uuid] || {}
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

  if (!invoices[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'Invoice not found' }
    return
  }

  const payload = (ctx.request.body || {}) as {
    name?: string
    description?: string
    notes?: string
    materials?: unknown
  }

  const nextName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : invoices[uuid].name
  const nextDescription =
    typeof payload.description === 'string' ? payload.description : invoices[uuid].description || ''
  const nextNotes = typeof payload.notes === 'string' ? payload.notes : invoices[uuid].notes || ''
  const nextMaterials =
    payload.materials === undefined ? invoices[uuid].materials || [] : normalizeMaterials(payload.materials)

  invoices[uuid] = {
    ...invoices[uuid],
    name: nextName,
    description: nextDescription,
    notes: nextNotes,
    materials: nextMaterials,
    updatedAt: new Date().toISOString()
  }

  await invoicesStore.put(invoices)

  ctx.body = { content: invoices[uuid], uuid }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
