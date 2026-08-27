import { Router } from '@koa/router'
import { opendir, mkdir } from 'fs/promises'
import { invoices, invoicesStore, hours, hoursStore, companies } from '../database/database.js'
import multer from '@koa/multer'
import { InvoiceHourLine, MaterialLine } from '../../types/index.js'
import { readDescoCatalog, syncDescoCatalogWithTracking } from '../helpers/desco.js'
import {
  readAlelekCatalog,
  syncAlelekCatalogWithTracking,
  syncAlelekCatalogViaScraperWithTracking
} from '../helpers/alelek.js'
import { shouldSyncAlelek, shouldSyncDesco } from '../helpers/sync-tracker.js'
import {
  addToHistory,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  getHistory,
  isFavorite
} from '../helpers/material-preferences.js'

const upload = multer({
  storage: multer.diskStorage({
    filename: (req, file, cb) => {
      cb(null, file.originalname)
    },
    destination: async (req, file, cb) => {
      const dir = `./.database/invoices/${new Date().getFullYear()}/images`
      try {
        const dirent = await opendir(dir)
        await dirent.close()
      } catch (error) {
        await mkdir(dir, { recursive: true })
      }
      cb(null, dir)
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024 // 10 MB
  }
})

const router = new Router({
  prefix: '/api/invoices'
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

const collectBillableHoursForJob = (jobId: string): InvoiceHourLine[] => {
  if (!jobId) return []

  const lines: InvoiceHourLine[] = []

  for (const [userId, userHours] of Object.entries(hours)) {
    const prestationIds: string[] = []
    let totalDuration = 0

    for (const [prestationId, prestation] of Object.entries(userHours || {})) {
      const isOnJob = prestation?.jobId === jobId
      const hasCheckout = typeof prestation?.checkout === 'number' && Number.isFinite(prestation.checkout)
      const notInvoiced = !prestation?.invoiceId && !prestation?.invoicedAt
      if (!isOnJob || !hasCheckout || !notInvoiced) continue

      const duration =
        typeof prestation.duration === 'number' && Number.isFinite(prestation.duration)
          ? prestation.duration
          : Math.max(0, Number(prestation.checkout) - Number(prestation.checkin))

      prestationIds.push(prestationId)
      totalDuration += Number.isFinite(duration) ? duration : 0
    }

    if (prestationIds.length > 0) {
      lines.push({
        userId,
        prestationIds,
        totalDuration
      })
    }
  }

  return lines
}

type ForceSyncContext = {
  query: Record<string, unknown>
  request: {
    body?: unknown
  }
}

const isForceSync = (ctx: ForceSyncContext): boolean => {
  const queryForce = typeof ctx.query.force === 'string' ? ctx.query.force.toLowerCase() : ''
  if (queryForce === '1' || queryForce === 'true' || queryForce === 'yes') return true

  const body = (ctx.request.body || {}) as { force?: unknown }
  return body.force === true || body.force === 'true' || body.force === '1'
}

router.get('/', async (ctx) => {
  ctx.body = invoices
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.get('/materials', async (ctx) => {
  const company = typeof ctx.query.company === 'string' ? ctx.query.company : ''
  const includePrices = String(ctx.query.includePrices || '').toLowerCase() === 'true'

  const linesByName = new Map<string, MaterialLine>()

  const setLine = (line: MaterialLine) => {
    const name = typeof line?.name === 'string' ? line.name.trim() : ''
    if (!name) return

    const key = name.toLowerCase()
    const existing = linesByName.get(key)

    if (!existing) {
      linesByName.set(key, {
        name,
        quantity: 1,
        unit: line.unit?.trim() || undefined,
        unitPrice: typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) ? line.unitPrice : undefined,
        articleNumber: line.articleNumber?.trim() || undefined,
        productNumber: line.productNumber?.trim() || undefined,
        packagingQuantity:
          typeof line.packagingQuantity === 'number' && Number.isFinite(line.packagingQuantity)
            ? line.packagingQuantity
            : undefined
      })
      return
    }

    linesByName.set(key, {
      ...existing,
      unit: existing.unit || line.unit?.trim() || undefined,
      unitPrice:
        existing.unitPrice ??
        (typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) ? line.unitPrice : undefined),
      articleNumber: existing.articleNumber || line.articleNumber?.trim() || undefined,
      productNumber: existing.productNumber || line.productNumber?.trim() || undefined,
      packagingQuantity:
        existing.packagingQuantity ??
        (typeof line.packagingQuantity === 'number' && Number.isFinite(line.packagingQuantity)
          ? line.packagingQuantity
          : undefined)
    })
  }

  for (const invoice of Object.values(invoices)) {
    if (company && invoice.company !== company) continue
    const materials = Array.isArray(invoice.materials) ? invoice.materials : []

    for (const material of materials) {
      setLine({
        name: typeof material?.name === 'string' ? material.name : '',
        quantity: 1,
        unit: typeof material?.unit === 'string' ? material.unit : undefined,
        unitPrice: typeof material?.unitPrice === 'number' ? material.unitPrice : undefined,
        articleNumber: typeof material?.articleNumber === 'string' ? material.articleNumber : undefined,
        productNumber: typeof material?.productNumber === 'string' ? material.productNumber : undefined,
        packagingQuantity: typeof material?.packagingQuantity === 'number' ? material.packagingQuantity : undefined
      })
    }
  }

  if (company) {
    const companyName = String(companies[company]?.name || '').toLowerCase()
    if (companyName.includes('desco')) {
      const descoCatalog = await readDescoCatalog()
      for (const item of descoCatalog.items) setLine(item)
    }

    if (companyName.includes('alelek') || companyName.includes('tecmine')) {
      const alelekCatalog = await readAlelekCatalog()
      for (const item of alelekCatalog.items) setLine(item)
    }
  }

  const lines = Array.from(linesByName.values()).sort((left, right) => left.name.localeCompare(right.name))

  ctx.body = includePrices ? lines : lines.map((line) => line.name)
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.get('/materials/desco', async (ctx) => {
  const catalog = await readDescoCatalog()
  ctx.body = catalog
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/materials/desco/sync', async (ctx) => {
  try {
    const forced = isForceSync(ctx)
    if (!forced && !(await shouldSyncDesco())) {
      const catalog = await readDescoCatalog()
      ctx.body = {
        ok: true,
        skipped: true,
        reason: 'Desco catalog was synced less than 7 days ago. Use ?force=true to bypass.',
        source: catalog.source,
        updatedAt: catalog.updatedAt,
        count: catalog.count
      }
      ctx.status = 200
      ctx.set('Content-Type', 'application/json')
      return
    }

    const catalog = await syncDescoCatalogWithTracking()
    ctx.body = {
      ok: true,
      forced,
      source: catalog.source,
      updatedAt: catalog.updatedAt,
      count: catalog.count
    }
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
  } catch (error) {
    ctx.body = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Desco sync error'
    }
    ctx.status = 502
    ctx.set('Content-Type', 'application/json')
  }
})

router.get('/materials/alelek', async (ctx) => {
  const catalog = await readAlelekCatalog()
  ctx.body = catalog
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/materials/alelek/sync', async (ctx) => {
  try {
    const forced = isForceSync(ctx)
    if (!forced && !(await shouldSyncAlelek())) {
      const catalog = await readAlelekCatalog()
      ctx.body = {
        ok: true,
        skipped: true,
        reason: 'Alelek catalog was synced less than 7 days ago. Use ?force=true to bypass.',
        source: catalog.source,
        updatedAt: catalog.updatedAt,
        count: catalog.count
      }
      ctx.status = 200
      ctx.set('Content-Type', 'application/json')
      return
    }

    const catalog = await syncAlelekCatalogWithTracking()
    ctx.body = {
      ok: true,
      forced,
      source: catalog.source,
      updatedAt: catalog.updatedAt,
      count: catalog.count
    }
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
  } catch (error) {
    ctx.body = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Alelek sync error'
    }
    ctx.status = 502
    ctx.set('Content-Type', 'application/json')
  }
})

router.post('/materials/alelek/sync-scraper', async (ctx) => {
  try {
    const forced = isForceSync(ctx)
    if (!forced && !(await shouldSyncAlelek())) {
      const catalog = await readAlelekCatalog()
      ctx.body = {
        ok: true,
        skipped: true,
        reason: 'Alelek catalog was synced less than 7 days ago. Use ?force=true to bypass.',
        source: catalog.source,
        updatedAt: catalog.updatedAt,
        count: catalog.count
      }
      ctx.status = 200
      ctx.set('Content-Type', 'application/json')
      return
    }

    const body = (ctx.request.body || {}) as { categoryUrls?: string[] }
    const catalog = await syncAlelekCatalogViaScraperWithTracking(body.categoryUrls)
    ctx.body = {
      ok: true,
      forced,
      source: catalog.source,
      updatedAt: catalog.updatedAt,
      count: catalog.count
    }
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
  } catch (error) {
    ctx.body = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Alelek scraper error'
    }
    ctx.status = 502
    ctx.set('Content-Type', 'application/json')
  }
})

router.post('/', async (ctx) => {
  const body = (ctx.request.body || {}) as {
    name?: string
    description?: string
    invoiceImages?: string[]
    company?: string
    job?: string
    user?: string
    notes?: string
    uuid?: string
    materials?: unknown
    hours?: unknown
    quoteId?: string
    laborAmount?: number
    discountAmount?: number
    vatRate?: number
  }
  const { name, description, invoiceImages, company, job, user, notes } = body
  const materials = normalizeMaterials(body.materials)
  const year = new Date().getFullYear()
  if (!name || !description || !invoiceImages || !company || !job || !user) {
    ctx.status = 400
    ctx.body = { error: 'Missing required fields' }
    return
  }
  const hoursSnapshot = job ? collectBillableHoursForJob(job) : []

  const invoice = {
    name,
    description,
    invoiceImages,
    company,
    job,
    user,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    year,
    notes,
    materials,
    hours: hoursSnapshot
    ,quoteId: typeof body.quoteId === 'string' ? body.quoteId : undefined
    ,laborAmount: Math.max(0, Number(body.laborAmount) || 0)
    ,discountAmount: Math.max(0, Number(body.discountAmount) || 0)
    ,vatRate: Math.min(100, Math.max(0, Number(body.vatRate) || 0))
  }

  const uuid = body.uuid || crypto.randomUUID()

  invoices[uuid] = invoice

  for (const line of hoursSnapshot) {
    const userHours = hours[line.userId]
    if (!userHours) continue
    for (const prestationId of line.prestationIds) {
      const prestation = userHours[prestationId]
      if (!prestation) continue
      prestation.invoiceId = uuid
      prestation.invoicedAt = Date.now()
    }
  }

  await Promise.all([invoicesStore.put(invoices), hoursStore.put(hours)])

  ctx.body = { content: invoice, uuid }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.delete('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  delete invoices[uuid]
  await invoicesStore.put(invoices)
  ctx.status = 204
})

router.post('/upload', upload.array('files'), async (ctx) => {
  const files = (ctx.files || []) as Array<{ path: string }>
  if (!files || files.length === 0) {
    ctx.status = 400
    ctx.body = { error: 'No files uploaded' }
    return
  }
  ctx.body = files.map((file) => file.path)
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

// Favorites endpoints
router.get('/preferences/favorites', async (ctx) => {
  ctx.body = await getFavorites()
})

router.post('/preferences/favorites', async (ctx) => {
  const material = ctx.request.body as MaterialLine
  if (!material?.name) {
    ctx.status = 400
    ctx.body = { error: 'Material name required' }
    return
  }
  await addToFavorites(material)
  ctx.status = 201
})

router.delete('/preferences/favorites/:name', async (ctx) => {
  const { name } = ctx.params
  if (!name) {
    ctx.status = 400
    ctx.body = { error: 'Name required' }
    return
  }
  await removeFromFavorites(decodeURIComponent(name))
  ctx.status = 204
})

router.get('/preferences/favorites/check/:name', async (ctx) => {
  const { name } = ctx.params
  if (!name) {
    ctx.status = 400
    ctx.body = { error: 'Name required' }
    return
  }
  ctx.body = { isFavorite: await isFavorite(decodeURIComponent(name)) }
})

// History endpoints
router.get('/preferences/history', async (ctx) => {
  ctx.body = await getHistory()
})

router.post('/preferences/history', async (ctx) => {
  const material = ctx.request.body as MaterialLine
  if (!material?.name) {
    ctx.status = 400
    ctx.body = { error: 'Material name required' }
    return
  }
  await addToHistory(material)
  ctx.status = 201
})

export default router.routes()
