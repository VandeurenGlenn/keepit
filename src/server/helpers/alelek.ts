import { mkdir, readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { MaterialLine } from '../../types/index.js'
import { scrapeAlekCategories, ScrapedProduct } from './alelek-scraper.js'
import { recordSync } from './sync-tracker.js'
import { scrapeAlekWithAuth } from './alelek-scraper.js'

type JsonObject = Record<string, unknown>

type AlelekConfig = {
  getAllProductsUrl?: string
  authorization?: string
  cookie?: string
}

type AlelekCatalog = {
  source: 'alelek'
  updatedAt: string
  count: number
  items: MaterialLine[]
}

const alelekCatalogPath = resolve('.database', 'alelek-materials.json')

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizePrice = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

const readServerConfig = async (): Promise<JsonObject> => {
  try {
    const raw = await readFile('./server.config.json', 'utf8')
    return JSON.parse(raw) as JsonObject
  } catch {
    return {}
  }
}

const readAlelekConfig = async (): Promise<AlelekConfig> => {
  const config = await readServerConfig()
  const maybeAlelek = config.alelek

  if (!maybeAlelek || typeof maybeAlelek !== 'object') {
    return {}
  }

  const alelekConfig = maybeAlelek as JsonObject

  return {
    getAllProductsUrl: normalizeString(alelekConfig.getAllProductsUrl),
    authorization: normalizeString(alelekConfig.authorization),
    cookie: normalizeString(alelekConfig.cookie)
  }
}

const getConfiguredAlelekUrl = async (): Promise<string> => {
  const config = await readAlelekConfig()
  return config.getAllProductsUrl || normalizeString(process.env.KEEPIT_ALELEK_GET_ALL_PRODUCTS_URL)
}

const getConfiguredAuthorization = async (): Promise<string> => {
  const config = await readAlelekConfig()
  return config.authorization || normalizeString(process.env.KEEPIT_ALELEK_AUTHORIZATION)
}

const getConfiguredCookie = async (): Promise<string> => {
  const config = await readAlelekConfig()
  return config.cookie || normalizeString(process.env.KEEPIT_ALELEK_COOKIE)
}

const decodeXmlEntities = (value: string): string => {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

const pickFirstString = (record: JsonObject, keys: string[]): string => {
  for (const key of keys) {
    const value = normalizeString(record[key])
    if (value) return value
  }

  return ''
}

const pickFirstPrice = (record: JsonObject, keys: string[]): number | undefined => {
  for (const key of keys) {
    const parsed = normalizePrice(record[key])
    if (parsed !== undefined) return parsed
  }

  return undefined
}

const materialFromObject = (record: JsonObject): MaterialLine | null => {
  const name = pickFirstString(record, [
    'name',
    'Name',
    'description',
    'Description',
    'productName',
    'ProductName',
    'articleDescription',
    'ArticleDescription',
    'omschrijving',
    'Omschrijving'
  ])

  if (!name) return null

  const unit = pickFirstString(record, ['unit', 'Unit', 'saleUnit', 'SaleUnit'])
  const unitPrice = pickFirstPrice(record, [
    'price',
    'Price',
    'unitPrice',
    'UnitPrice',
    'netPrice',
    'NetPrice',
    'listPrice',
    'ListPrice'
  ])

  return {
    name,
    quantity: 1,
    unit: unit || undefined,
    unitPrice
  }
}

const parseJsonMaterials = (payload: unknown): MaterialLine[] => {
  const queue: unknown[] = [payload]
  const materials: MaterialLine[] = []

  while (queue.length > 0) {
    const current = queue.shift()

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    if (!current || typeof current !== 'object') {
      continue
    }

    const currentRecord = current as JsonObject
    const asMaterial = materialFromObject(currentRecord)
    if (asMaterial) materials.push(asMaterial)

    for (const value of Object.values(currentRecord)) {
      if (value && typeof value === 'object') queue.push(value)
    }
  }

  return materials
}

const getXmlTagValue = (block: string, tags: string[]): string => {
  for (const tag of tags) {
    const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
    const match = block.match(pattern)
    if (match?.[1]) {
      return decodeXmlEntities(match[1].trim())
    }
  }

  return ''
}

const parseXmlMaterials = (xml: string): MaterialLine[] => {
  const productBlocks = xml.match(/<(product|article)\b[\s\S]*?<\/\1>/gi) || []
  const materials: MaterialLine[] = []

  for (const block of productBlocks) {
    const name = getXmlTagValue(block, [
      'Description',
      'description',
      'ProductName',
      'productName',
      'Name',
      'name',
      'ArticleDescription',
      'articleDescription'
    ])

    if (!name) continue

    const unit = getXmlTagValue(block, ['Unit', 'unit', 'SaleUnit', 'saleUnit', 'PackingUnit']) || undefined
    const unitPrice = normalizePrice(
      getXmlTagValue(block, ['Price', 'price', 'UnitPrice', 'unitPrice', 'NetPrice', 'netPrice'])
    )

    materials.push({
      name,
      quantity: 1,
      unit,
      unitPrice
    })
  }

  return materials
}

const parseNumberFromSpreadsheet = (value: string): number | undefined => {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === delimiter) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

const pickDelimiter = (line: string): string => {
  const delimiters = ['\t', ';', ',']
  let bestDelimiter = ';'
  let bestScore = -1

  for (const delimiter of delimiters) {
    const score = splitDelimitedLine(line, delimiter).length
    if (score > bestScore) {
      bestScore = score
      bestDelimiter = delimiter
    }
  }

  return bestDelimiter
}

const normalizeHeader = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const findHeaderIndex = (headers: string[], candidates: string[]): number => {
  const normalized = headers.map(normalizeHeader)

  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizeHeader(candidate))
    if (index !== -1) return index
  }

  return -1
}

const parseTabularMaterials = (raw: string): MaterialLine[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) return []

  const delimiter = pickDelimiter(lines[0])
  const headers = splitDelimitedLine(lines[0], delimiter)
  const nameIndex = findHeaderIndex(headers, [
    'omschrijving',
    'description',
    'productname',
    'naam',
    'name',
    'artikelomschrijving'
  ])

  if (nameIndex === -1) return []

  const unitIndex = findHeaderIndex(headers, ['eenheid', 'unit', 'saleunit'])
  const priceIndex = findHeaderIndex(headers, ['nettoprijs', 'netprice', 'price', 'prijs', 'unitprice', 'listprice'])

  const materials: MaterialLine[] = []

  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter)
    const name = normalizeString(cells[nameIndex])
    if (!name) continue

    const unit = unitIndex >= 0 ? normalizeString(cells[unitIndex]) : ''
    const unitPrice = priceIndex >= 0 ? parseNumberFromSpreadsheet(cells[priceIndex] || '') : undefined

    materials.push({
      name,
      quantity: 1,
      unit,
      unitPrice
    })
  }

  return materials
}

const dedupeMaterials = (items: MaterialLine[]): MaterialLine[] => {
  const byName = new Map<string, MaterialLine>()

  for (const item of items) {
    const key = item.name.trim().toLowerCase()
    if (!key) continue

    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, item)
      continue
    }

    byName.set(key, {
      ...existing,
      unit: existing.unit || item.unit,
      unitPrice: existing.unitPrice ?? item.unitPrice
    })
  }

  return Array.from(byName.values()).sort((left, right) => {
    const aNum = left.articleNumber || ''
    const bNum = right.articleNumber || ''
    if (aNum && bNum) return aNum.localeCompare(bNum)
    if (aNum) return -1
    if (bNum) return 1
    return left.name.localeCompare(right.name)
  })
}

const parseAlelekMaterials = (raw: string, contentType: string): MaterialLine[] => {
  const payloadLooksLikeJson = contentType.includes('application/json') || /^[\[{]/.test(raw.trim())

  if (payloadLooksLikeJson) {
    try {
      return dedupeMaterials(parseJsonMaterials(JSON.parse(raw) as unknown))
    } catch {
      // fall back to XML parser when payload is not valid JSON
    }
  }

  const looksTabular =
    contentType.includes('csv') ||
    contentType.includes('excel') ||
    contentType.includes('spreadsheetml') ||
    raw.includes('\t') ||
    raw.includes(';')

  if (looksTabular) {
    const tabular = parseTabularMaterials(raw)
    if (tabular.length > 0) return dedupeMaterials(tabular)
  }

  return dedupeMaterials(parseXmlMaterials(raw))
}

const writeAlelekCatalog = async (items: MaterialLine[]): Promise<AlelekCatalog> => {
  await mkdir(resolve('.database'), { recursive: true })

  const catalog: AlelekCatalog = {
    source: 'alelek',
    updatedAt: new Date().toISOString(),
    count: items.length,
    items
  }

  await writeFile(alelekCatalogPath, JSON.stringify(catalog, null, 2), 'utf8')

  return catalog
}

export const readAlelekCatalog = async (): Promise<AlelekCatalog> => {
  try {
    const raw = await readFile(alelekCatalogPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AlelekCatalog>

    if (!Array.isArray(parsed.items)) {
      return {
        source: 'alelek',
        updatedAt: '',
        count: 0,
        items: []
      }
    }

    return {
      source: 'alelek',
      updatedAt: normalizeString(parsed.updatedAt),
      count: Number(parsed.count) || parsed.items.length,
      items: dedupeMaterials(parsed.items)
    }
  } catch {
    return {
      source: 'alelek',
      updatedAt: '',
      count: 0,
      items: []
    }
  }
}

export const syncAlelekCatalog = async (): Promise<AlelekCatalog> => {
  const url = await getConfiguredAlelekUrl()

  if (!url) {
    throw new Error(
      'Alelek is not configured. Set alelek.getAllProductsUrl in server.config.json or KEEPIT_ALELEK_GET_ALL_PRODUCTS_URL.'
    )
  }

  const authorization = await getConfiguredAuthorization()
  const cookie = await getConfiguredCookie()
  const headers: Record<string, string> = {
    Accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8'
  }

  if (authorization) {
    headers.Authorization = authorization
  }

  if (cookie) {
    headers.Cookie = cookie
  }

  const response = await fetch(url, {
    method: 'GET',
    headers
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Alelek sync failed (${response.status}). ${text.slice(0, 200)}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const arrayBuffer = await response.arrayBuffer()
  const utf8Text = Buffer.from(arrayBuffer).toString('utf8')
  const raw = utf8Text.includes('\uFFFD') ? Buffer.from(arrayBuffer).toString('latin1') : utf8Text
  const items = parseAlelekMaterials(raw, contentType)

  if (items.length === 0) {
    throw new Error('Alelek sync returned no material entries. Check endpoint/credentials and payload format.')
  }

  return writeAlelekCatalog(items)
}

export const syncAlelekCatalogWithTracking = async (): Promise<AlelekCatalog> => {
  const catalog = await syncAlelekCatalog()
  await recordSync('alelek')
  return catalog
}

export const syncAlelekCatalogViaScraperWithTracking = async (categoryUrls?: string[]): Promise<AlelekCatalog> => {
  const catalog = await syncAlelekCatalogViaScraper(categoryUrls)
  await recordSync('alelek')
  return catalog
}

export const syncAlelekCatalogViaScraper = async (categoryUrls?: string[]): Promise<AlelekCatalog> => {
  const products = await scrapeAlekCategories(categoryUrls, {
    headless: true,
    timeout: 30000
  })

  if (products.length === 0) {
    const fallbackCatalog = await readAlelekCatalog()
    if (fallbackCatalog.items.length > 0) {
      return fallbackCatalog
    }

    throw new Error('Alelek scraper returned no products. Check Groep Alelek website availability.')
  }

  const items = products
    .filter((product): product is ScrapedProduct & { name: string } => !!product.name)
    .map((product: ScrapedProduct) => ({
      name: product.name,
      quantity: 1,
      unit: undefined,
      unitPrice: product.price
    }))

  if (items.length === 0) {
    const fallbackCatalog = await readAlelekCatalog()
    if (fallbackCatalog.items.length > 0) {
      return fallbackCatalog
    }

    throw new Error('No valid materials found from scraper results.')
  }

  return writeAlelekCatalog(items)
}

export const scrapeAndStoreAlekMaterials = async (): Promise<void> => {
  const categoryUrls = [
    'https://webshop.groepalelek.be/nl/producten/installatie-pgn1',
    'https://webshop.groepalelek.be/nl/producten/multimedia-pgn2',
    'https://webshop.groepalelek.be/nl/producten/industrie-pgn3'
  ]

  const username = process.env.ALELEK_USERNAME || 'default-username'
  const password = process.env.ALELEK_PASSWORD || 'default-password'

  const products = await scrapeAlekWithAuth(categoryUrls, {
    headless: true,
    timeout: 30000,
    username,
    password
  })

  const catalog: AlelekCatalog = {
    source: 'alelek',
    updatedAt: new Date().toISOString(),
    count: products.length,
    items: products.map((product) => ({
      name: product.name,
      unit: 'piece',
      unitPrice: product.price,
      quantity: 1
    }))
  }

  await writeFile(alelekCatalogPath, JSON.stringify(catalog, null, 2), 'utf8')
  console.log(`Scraped and stored ${products.length} Alelek materials.`)
}
