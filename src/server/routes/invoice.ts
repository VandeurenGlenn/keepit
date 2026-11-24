import { Router } from '@koa/router'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { sep } from 'node:path'

import { invoices, invoicesStore, jobs } from '../database/database.js'
import { collectRemainingMaterials, findMaterialOverbilling, otherJobInvoices } from '../helpers/billable-materials.js'
import { normalizeInvoiceMaterials } from '../helpers/invoice-materials.js'
import { allocateMaterialDiscount, materialDiscountContext, materialSubtotal } from '../../helpers/material-discount.js'
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
  const current = invoices[uuid]
  let nextMaterials = current.materials || []
  let jobMaterialDiscountAmount = current.jobMaterialDiscountAmount
  if (payload.materials !== undefined) {
    if (!Array.isArray(payload.materials)) {
      ctx.status = 400
      ctx.body = { error: 'Geef een geldige materiaallijst op.' }
      return
    }
    nextMaterials = normalizeInvoiceMaterials(payload.materials)
    if (nextMaterials.length !== payload.materials.length) {
      ctx.status = 400
      ctx.body = { error: 'Controleer de materiaalregels.' }
      return
    }
    const job = Object.hasOwn(jobs, current.job) ? jobs[current.job] : undefined
    if (!job) {
      ctx.status = 409
      ctx.body = { error: 'De gekoppelde job ontbreekt; de factureerbare materialen kunnen niet gecontroleerd worden.' }
      return
    }
    const others = otherJobInvoices(invoices, current.job, uuid)
    const jobMaterials = job.materials || []
    const overbilled = findMaterialOverbilling(nextMaterials, jobMaterials, collectRemainingMaterials(
      jobMaterials, others.flatMap((invoice) => invoice.materials || [])
    ))
    if (overbilled) {
      ctx.status = 409
      ctx.body = { error: `${overbilled.name}: je factureert meer dan er nog beschikbaar is voor deze job.` }
      return
    }
    if (current.jobMaterialDiscountPercent !== undefined) {
      jobMaterialDiscountAmount = allocateMaterialDiscount(materialSubtotal(nextMaterials), materialDiscountContext(current.jobMaterialDiscountPercent, others))
    }
  }

  invoices[uuid] = {
    ...invoices[uuid],
    name: nextName,
    description: nextDescription,
    notes: nextNotes,
    materials: nextMaterials,
    jobMaterialDiscountAmount,
    updatedAt: new Date().toISOString()
  }

  await invoicesStore.put(invoices)

  ctx.body = { content: invoices[uuid], uuid }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
