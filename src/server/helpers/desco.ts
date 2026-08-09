import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { MaterialLine } from '../../types/index.js'
import { recordSync } from './sync-tracker.js'
import { mergeDescoMetadataItems, type DescoMaterialMetadata } from './desco-metadata.js'
import * as XLSX from 'xlsx'

type JsonObject = Record<string, unknown>

type DescoCatalog = {
  source: 'desco'
  updatedAt: string
  count: number
  items: MaterialLine[]
}

type DescoMetadataCatalog = {
  source: 'desco-metadata'
  updatedAt: string
  items: DescoMaterialMetadata[]
}

const descoCatalogPath = resolve('.database', 'desco-materials.json')
const descoMetadataPath = resolve('.database', 'desco-materials.metadata.json')
const descoArticlesPath = resolve('.database', 'desco', 'articles.xlsx')
let descoCatalogCache: { modifiedAt: number; catalog: DescoCatalog } | undefined

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

const fallbackDescriptionPhrases = [
  'geen beschrijving',
  'omschrijving volgt',
  'beschrijving niet beschikbaar',
  'n/a',
  'onbekend',
  'lorem ipsum'
]

const hasTechnicalData = (value: unknown): value is Record<string, string> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0)
}

const hasValidDescription = (value: unknown): value is string => {
  const description = normalizeString(value)
  if (description.length < 10) return false

  const normalized = description.toLowerCase()
  return !fallbackDescriptionPhrases.some((phrase) => normalized.includes(phrase))
}

const hasValidImage = (value: unknown): value is string => {
  const image = normalizeString(value)
  if (!image) return false

  return (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('/media/') ||
    image.startsWith('/cache/desco/')
  )
}

const isMetadataEnriched = (meta: DescoMaterialMetadata | undefined): boolean => {
  if (!meta) return false

  const enrichedAt = normalizeString(meta.enrichedAt)
  if (!enrichedAt) return false

  return hasValidDescription(meta.description) && (hasValidImage(meta.image) || hasTechnicalData(meta.technicalData))
}

const normalizeKey = (value: string | undefined): string => value?.trim().toLowerCase() || ''

const buildMetadataKeys = (
  item: Pick<MaterialLine, 'name' | 'articleNumber' | 'productNumber'> | DescoMaterialMetadata
): string[] => {
  return [normalizeKey(item.articleNumber), normalizeKey(item.productNumber), normalizeKey(item.name)].filter(
    (key): key is string => key.length > 0
  )
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const enrichViaGoogle = async (material: MaterialLine): Promise<Partial<DescoMaterialMetadata>> => {
  try {
    await sleep(500)

    const searchQuery = encodeURIComponent(
      `${material.name}${material.articleNumber ? ` ${material.articleNumber}` : ''}`
    )
    const url = `https://www.google.com/search?q=${searchQuery}`

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    if (!response.ok) return {}

    const html = await response.text()
    const descriptionMatch = html.match(
      /<span[^>]*class="VwiC3b"[^>]*>([^<]+)<\/span>|<span[^>]*style="[^"]*color:[^"]*"[^>]*>([^<]{20,})<\/span>/i
    )
    const description = descriptionMatch ? (descriptionMatch[1] || descriptionMatch[2])?.trim() : undefined

    const imageMatch = html.match(
      /<img[^>]*src="(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp))"[^>]*alt="[^"]*\b(product|item|image)\b/i
    )
    const image = imageMatch ? imageMatch[1] : undefined

    return {
      description: hasValidDescription(description) ? description : undefined,
      image: hasValidImage(image) ? image : undefined,
      technicalData: undefined
    }
  } catch {
    return {}
  }
}

const readDescoMetadataCatalog = async (): Promise<DescoMetadataCatalog> => {
  try {
    const raw = await readFile(descoMetadataPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<DescoMetadataCatalog>

    if (!Array.isArray(parsed.items)) {
      return {
        source: 'desco-metadata',
        updatedAt: '',
        items: []
      }
    }

    return {
      source: 'desco-metadata',
      updatedAt: normalizeString(parsed.updatedAt),
      items: parsed.items
    }
  } catch {
    return {
      source: 'desco-metadata',
      updatedAt: '',
      items: []
    }
  }
}

const writeDescoMetadataCatalog = async (items: DescoMaterialMetadata[]): Promise<DescoMetadataCatalog> => {
  await mkdir(resolve('.database'), { recursive: true })

  const catalog: DescoMetadataCatalog = {
    source: 'desco-metadata',
    updatedAt: new Date().toISOString(),
    items
  }

  await writeFile(descoMetadataPath, JSON.stringify(catalog, null, 2), 'utf8')

  return catalog
}

const applyDescoMetadata = (items: MaterialLine[], metadataItems: DescoMaterialMetadata[]): MaterialLine[] => {
  const metadataByKey = new Map<string, DescoMaterialMetadata>()

  for (const metadata of metadataItems) {
    const keys = buildMetadataKeys(metadata)
    for (const key of keys) {
      metadataByKey.set(key, metadata)
    }
  }

  return items.map((item) => {
    const metadata = buildMetadataKeys(item)
      .map((key) => metadataByKey.get(key))
      .find(Boolean)

    if (!metadata) return item

    const metadataDescription = hasValidDescription(metadata.description)
      ? normalizeString(metadata.description)
      : undefined
    const metadataImage = hasValidImage(metadata.image) ? normalizeString(metadata.image) : undefined
    const metadataTechnicalData = hasTechnicalData(metadata.technicalData) ? metadata.technicalData : undefined

    return {
      ...item,
      description: item.description || metadataDescription,
      image: item.image || metadataImage,
      technicalData: item.technicalData || metadataTechnicalData,
      manufacturerData: item.manufacturerData || metadata.manufacturerData,
      dataSources: item.dataSources?.length ? item.dataSources : metadata.dataSources,
      imageCandidates: item.imageCandidates?.length ? item.imageCandidates : metadata.imageCandidates
    }
  })
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
  const articleNumberIndex = findHeaderIndex(headers, ['artikelnummer', 'articlenumber', 'articlecode'])
  const productNumberIndex = findHeaderIndex(headers, ['productnummer', 'productnumber'])
  const packagingQuantityIndex = findHeaderIndex(headers, [
    'verpakkingshoeveelheidvph',
    'verpakkingshoeveelheid',
    'vph',
    'packagingquantity'
  ])
  const priceIndex = findHeaderIndex(headers, [
    'brutoprijs',
    'brutoprice',
    'nettoprijs',
    'netprice',
    'price',
    'prijs',
    'unitprice',
    'listprice'
  ])

  const materials: MaterialLine[] = []

  for (const line of lines.slice(1)) {
    const cells = splitDelimitedLine(line, delimiter)
    const name = normalizeString(cells[nameIndex])
    if (!name) continue

    const unit = unitIndex >= 0 ? normalizeString(cells[unitIndex]) : ''
    const articleNumber = articleNumberIndex >= 0 ? normalizeString(cells[articleNumberIndex]) : ''
    const productNumber = productNumberIndex >= 0 ? normalizeString(cells[productNumberIndex]) : ''
    const packagingQuantity =
      packagingQuantityIndex >= 0 ? parseNumberFromSpreadsheet(cells[packagingQuantityIndex] || '') : undefined
    const unitPrice = priceIndex >= 0 ? parseNumberFromSpreadsheet(cells[priceIndex] || '') : undefined

    materials.push({
      name,
      quantity: 1,
      unit: unit || undefined,
      unitPrice,
      articleNumber: articleNumber || undefined,
      productNumber: productNumber || undefined,
      packagingQuantity
    })
  }

  return materials
}

const parseXlsxMaterials = (binary: Buffer): MaterialLine[] => {
  try {
    const workbook = XLSX.read(binary, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return []

    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: ''
    })

    if (rows.length < 2) return []

    const headers = (rows[0] || []).map((value) => normalizeString(String(value)))
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
    const articleNumberIndex = findHeaderIndex(headers, ['artikelnummer', 'articlenumber', 'articlecode'])
    const productNumberIndex = findHeaderIndex(headers, ['productnummer', 'productnumber'])
    const packagingQuantityIndex = findHeaderIndex(headers, [
      'verpakkingshoeveelheidvph',
      'verpakkingshoeveelheid',
      'vph',
      'packagingquantity'
    ])
    const priceIndex = findHeaderIndex(headers, [
      'brutoprijs',
      'brutoprice',
      'nettoprijs',
      'netprice',
      'price',
      'prijs',
      'unitprice',
      'listprice'
    ])
    const materials: MaterialLine[] = []

    for (const row of rows.slice(1)) {
      const values = Array.isArray(row) ? row : []
      const name = normalizeString(String(values[nameIndex] ?? ''))
      if (!name) continue

      const unit = unitIndex >= 0 ? normalizeString(String(values[unitIndex] ?? '')) : ''
      const articleNumber = articleNumberIndex >= 0 ? normalizeString(String(values[articleNumberIndex] ?? '')) : ''
      const productNumber = productNumberIndex >= 0 ? normalizeString(String(values[productNumberIndex] ?? '')) : ''
      const packagingCell = packagingQuantityIndex >= 0 ? values[packagingQuantityIndex] : undefined
      const priceCell = priceIndex >= 0 ? values[priceIndex] : undefined

      const packagingQuantity =
        typeof packagingCell === 'number'
          ? normalizePrice(packagingCell)
          : parseNumberFromSpreadsheet(normalizeString(String(packagingCell ?? '')))

      const unitPrice =
        typeof priceCell === 'number'
          ? normalizePrice(priceCell)
          : parseNumberFromSpreadsheet(normalizeString(String(priceCell ?? '')))

      materials.push({
        name,
        quantity: 1,
        unit: unit || undefined,
        unitPrice,
        articleNumber: articleNumber || undefined,
        productNumber: productNumber || undefined,
        packagingQuantity
      })
    }

    return materials
  } catch {
    return []
  }
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
      unitPrice: existing.unitPrice ?? item.unitPrice,
      articleNumber: existing.articleNumber || item.articleNumber,
      productNumber: existing.productNumber || item.productNumber,
      packagingQuantity: existing.packagingQuantity ?? item.packagingQuantity,
      description: existing.description || item.description,
      image: existing.image || item.image,
      technicalData: existing.technicalData || item.technicalData,
      manufacturerData: existing.manufacturerData || item.manufacturerData,
      dataSources: existing.dataSources?.length ? existing.dataSources : item.dataSources,
      imageCandidates: existing.imageCandidates?.length ? existing.imageCandidates : item.imageCandidates
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

const parseDescoMaterials = (raw: string, contentType: string, binary: Buffer): MaterialLine[] => {
  const isZipPayload = binary.length > 4 && binary[0] === 0x50 && binary[1] === 0x4b
  const looksLikeXlsx = contentType.includes('spreadsheetml') || isZipPayload

  if (looksLikeXlsx) {
    const xlsxMaterials = parseXlsxMaterials(binary)
    if (xlsxMaterials.length > 0) return dedupeMaterials(xlsxMaterials)
  }

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

const writeDescoCatalog = async (items: MaterialLine[]): Promise<DescoCatalog> => {
  await mkdir(resolve('.database'), { recursive: true })

  const catalog: DescoCatalog = {
    source: 'desco',
    updatedAt: new Date().toISOString(),
    count: items.length,
    items
  }

  await writeFile(descoCatalogPath, JSON.stringify(catalog, null, 2), 'utf8')

  return catalog
}

export const readDescoCatalog = async (): Promise<DescoCatalog> => {
  try {
    const modifiedAt = (await stat(descoCatalogPath)).mtimeMs
    if (descoCatalogCache?.modifiedAt === modifiedAt) return descoCatalogCache.catalog

    const raw = await readFile(descoCatalogPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<DescoCatalog>

    if (!Array.isArray(parsed.items)) {
      return {
        source: 'desco',
        updatedAt: '',
        count: 0,
        items: []
      }
    }

    const catalog: DescoCatalog = {
      source: 'desco',
      updatedAt: normalizeString(parsed.updatedAt),
      count: Number(parsed.count) || parsed.items.length,
      items: dedupeMaterials(parsed.items)
    }
    descoCatalogCache = { modifiedAt, catalog }
    return catalog
  } catch {
    return {
      source: 'desco',
      updatedAt: '',
      count: 0,
      items: []
    }
  }
}

/**
 * Seeds metadata cache from catalog: one-to-one copy of all materials with description/image.
 * This is the SOURCE OF TRUTH—no external scraping, just use what Desco gives us.
 */
export const seedDescoMetadata = async (materials?: MaterialLine[]): Promise<void> => {
  const metadataCatalog = await readDescoMetadataCatalog()

  if (!materials) {
    await writeDescoMetadataCatalog(metadataCatalog.items)
    return
  }

  const newMetadata = mergeDescoMetadataItems(materials, metadataCatalog.items)

  await writeDescoMetadataCatalog(newMetadata)
}

export const syncDescoCatalog = async (): Promise<DescoCatalog> => {
  let binary: Buffer

  try {
    binary = await readFile(descoArticlesPath)
  } catch {
    const fallbackCatalog = await readDescoCatalog()
    if (fallbackCatalog.items.length > 0) {
      return fallbackCatalog
    }
    throw new Error(`Desco Excel file not found at ${descoArticlesPath}.`)
  }

  const raw = binary.toString('latin1')
  const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const items = parseDescoMaterials(raw, contentType, binary)

  if (items.length === 0) {
    const fallbackCatalog = await readDescoCatalog()
    if (fallbackCatalog.items.length > 0) {
      return fallbackCatalog
    }
    throw new Error(`Desco Excel at ${descoArticlesPath} returned no material entries.`)
  }

  // Ensure metadata cache is up-to-date for all articles
  await seedDescoMetadata(items)
  const metadataCatalog = await readDescoMetadataCatalog()
  const enrichedItems = applyDescoMetadata(items, metadataCatalog.items)
  return writeDescoCatalog(enrichedItems)
}

export const syncDescoCatalogWithTracking = async (): Promise<DescoCatalog> => {
  const catalog = await syncDescoCatalog()
  await recordSync('desco')
  return catalog
}

export const enrichDescoCatalog = async (): Promise<DescoCatalog> => {
  const catalog = await readDescoCatalog()
  if (catalog.items.length === 0) {
    throw new Error('Desco catalog is empty. Run sync first before enrichment.')
  }

  // Seed metadata from catalog: 1:1 copy of all materials with their existing description/image
  // (no external scraping—use what Desco gives us)
  await seedDescoMetadata(catalog.items)
  const metadataCatalog = await readDescoMetadataCatalog()

  // Apply all metadata to catalog
  const enrichedItems = applyDescoMetadata(catalog.items, metadataCatalog.items)
  return writeDescoCatalog(enrichedItems)
}
