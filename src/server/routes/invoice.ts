import { Router } from '@koa/router'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { sep } from 'node:path'

import { invoices, invoicesStore } from '../database/database.js'
import { MaterialLine } from '../../types/index.js'
import { databasePath } from '../helpers/paths.js'
import { invoiceAttachmentPath } from '../helpers/invoice-attachment.js'

const router = new Router({
  prefix: '/api/invoice'
})

router.get('/:uuid/attachment/:index', async (ctx) => {
  const index = Number(ctx.params.index)
  const invoice = Object.hasOwn(invoices, ctx.params.uuid) ? invoices[ctx.params.uuid] : undefined
  const reference = Number.isSafeInteger(index) && index >= 0 ? invoice?.invoiceImages?.[index] : undefined
  const attachment = invoiceAttachmentPath(reference)
  if (attachment) {
    try {
      const root = await realpath(databasePath('invoices'))
      const file = await realpath(databasePath('invoices', attachment.year, 'images', attachment.filename))
      if (file.startsWith(root + sep)) {
        const info = await stat(file)
        if (info.isFile()) {
          ctx.type = 'application/octet-stream'
          ctx.attachment(attachment.filename)
          ctx.length = info.size
          ctx.set('Cache-Control', 'private, no-store')
          ctx.body = createReadStream(file)
          return
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  ctx.status = 404
  ctx.body = { error: 'Factuurbijlage niet gevonden.' }
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
      unitPrice: unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined,
      kind: item?.kind === 'small-materials' ? 'small-materials' : 'material',
      smallMaterialAmount: Number.isFinite(Number(item?.smallMaterialAmount)) ? Number(item.smallMaterialAmount) : undefined,
      articleNumber: typeof item?.articleNumber === 'string' ? item.articleNumber.trim() || undefined : undefined,
      productNumber: typeof item?.productNumber === 'string' ? item.productNumber.trim() || undefined : undefined,
      packagingQuantity: Number.isFinite(Number(item?.packagingQuantity)) ? Number(item.packagingQuantity) : undefined,
      description: typeof item?.description === 'string' ? item.description : undefined,
      image: typeof item?.image === 'string' ? item.image : undefined,
      technicalData: item?.technicalData && typeof item.technicalData === 'object' ? item.technicalData : undefined
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
  const invoice = invoices[uuid]
  if (!invoice) {
    ctx.status = 404
    ctx.body = { error: 'Factuur niet gevonden.' }
    return
  }
  ctx.body = invoice
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
