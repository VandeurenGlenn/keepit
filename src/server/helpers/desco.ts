import { mkdir, readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { MaterialLine } from '../../types/index.js'
import { recordSync } from './sync-tracker.js'
import * as XLSX from 'xlsx'

type JsonObject = Record<string, unknown>

type DescoConfig = {
  getAllProductsUrl?: string
  authorization?: string
  cookie?: string
  referer?: string
  userAgent?: string
}

type DescoCatalog = {
  source: 'desco'
  updatedAt: string
  count: number
  items: MaterialLine[]
}

type DescoMaterialMetadata = {
  articleNumber?: string
  productNumber?: string
  name?: string
  description?: string
  image?: string
  technicalData?: Record<string, string>
}

type DescoMetadataCatalog = {
  source: 'desco-metadata'
  updatedAt: string
  items: DescoMaterialMetadata[]
}

const descoCatalogPath = resolve('.database', 'desco-materials.json')
const descoMetadataPath = resolve('.database', 'desco-materials.metadata.json')

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

const normalizeKey = (value: string | undefined): string => value?.trim().toLowerCase() || ''

const isMetadataEnriched = (meta: DescoMaterialMetadata | undefined): boolean => {
  if (!meta) return false
  return Boolean(meta.description || meta.image || (meta.technicalData && Object.keys(meta.technicalData).length > 0))
}

const mergeTechnicalData = (rows: Array<{ label: string; value: string }>): Record<string, string> | undefined => {
  const technicalData: Record<string, string> = {}

  for (const row of rows) {
    const label = normalizeString(row.label)
    const value = normalizeString(row.value)
    if (!label || !value) continue

    if (technicalData[label]) {
      technicalData[label] = `${technicalData[label]}, ${value}`
      continue
    }

    technicalData[label] = value
  }

  return Object.keys(technicalData).length > 0 ? technicalData : undefined
}

const buildDescoSearchQuery = (material: MaterialLine): string => {
  return material.articleNumber || material.productNumber || material.name
}

const runWithConcurrency = async <T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> => {
  let currentIndex = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const nextIndex = currentIndex
      currentIndex += 1
      await task(items[nextIndex])
    }
  })

  await Promise.all(workers)
}

const createDescoBrowser = async (): Promise<Browser> => {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
}

const findDescoDetailUrl = async (page: Page, material: MaterialLine): Promise<string | undefined> => {
  const query = buildDescoSearchQuery(material)
  if (!query) return undefined

  await page.goto(`${descoSearchUrl}#s=${encodeURIComponent(query)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000
  })

  await page.waitForSelector('body', { timeout: 15000 })
  await page
    .waitForFunction(
      (searchQuery) => {
        return (
          document.body.innerText.includes(searchQuery) ||
          Boolean(document.querySelector('a[href*="/producten/info/"]')) ||
          Boolean(document.querySelector('a[href*="qpid="]'))
        )
      },
      { timeout: 20000 },
      query
    )
    .catch(() => undefined)

  return page.evaluate((articleNumber) => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => (anchor as HTMLAnchorElement).href)
      .filter((href) => href.includes('/producten/info/'))

    const exactMatch = articleNumber ? links.find((href) => href.includes(`qpid=${articleNumber}`)) : undefined
    return exactMatch || links[0] || undefined
  }, material.articleNumber)
}

const scrapeDescoDetailMetadata = async (
  page: Page,
  detailUrl: string,
  material: MaterialLine
): Promise<DescoMaterialMetadata | undefined> => {
  await page.goto(detailUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  })

  await page.waitForSelector('body', { timeout: 15000 })
  await page
    .waitForFunction(
      (articleNumber, fallbackName) => {
        const text = document.body.innerText.toLowerCase()
        return (
          Boolean(articleNumber && document.body.innerText.includes(articleNumber)) ||
          Boolean(fallbackName && text.includes(fallbackName.toLowerCase())) ||
          text.includes('kenmerken')
        )
      },
      { timeout: 20000 },
      material.articleNumber,
      material.name
    )
    .catch(() => undefined)

  return page
    .evaluate((fallbackName) => {
      const clean = (value: string | null | undefined): string => value?.replace(/\s+/g, ' ').trim() || ''
      const ignoredHeadings = new Set([
        'toegang aanvragen als',
        'verkooppunten',
        'logistiek',
        'kenmerken',
        'foute productinfo'
      ])

      const name = Array.from(document.querySelectorAll('h1, h2'))
        .map((element) => clean(element.textContent))
        .find((value) => value && !ignoredHeadings.has(value.toLowerCase()))

      const imageSources = Array.from(document.images)
        .map((image) => image.src)
        .filter((src) => /\/files\/OCA\//i.test(src))

      const image =
        imageSources.find((src) => /_M\./i.test(src)) ||
        imageSources.find((src) => /_XL\./i.test(src)) ||
        imageSources.find((src) => /_XS\./i.test(src)) ||
        imageSources[0] ||
        ''

      const knownLabels = new Set([
        'categorie',
        'uitvoering',
        'merk',
        'reeks',
        'materiaal',
        'toepassing',
        'diameter',
        'radius',
        'type',
        'kleur',
        'vermogen',
        'debiet',
        'maat',
        'lengte',
        'breedte',
        'hoogte'
      ])

      const tables = Array.from(document.querySelectorAll('table'))
        .map((table) => {
          const rows = Array.from(table.querySelectorAll('tr'))
            .map((row) => {
              const cells = Array.from(row.querySelectorAll('th, td')).map((cell) => clean(cell.textContent))
              if (cells.length !== 2 || !cells[0] || !cells[1]) return null
              return { label: cells[0], value: cells[1] }
            })
            .filter((row): row is { label: string; value: string } => Boolean(row))

          const score = rows.reduce((total, row) => {
            const key = row.label.toLowerCase()
            return total + (knownLabels.has(key) ? 2 : 0)
          }, 0)

          return { rows, score }
        })
        .filter((table) => table.rows.length > 0)
        .sort((left, right) => right.score - left.score)

      const technicalRows = tables[0]?.score ? tables[0].rows : []

      return {
        name: clean(name) || clean(fallbackName) || undefined,
        description: clean(name) || clean(fallbackName) || undefined,
        image: image || undefined,
        technicalRows
      }
    }, material.name)
    .then((result) => {
      const technicalData = mergeTechnicalData(result.technicalRows)

      if (!result.name && !result.description && !result.image && !technicalData) {
        return undefined
      }

      return {
        name: result.name,
        description: result.description,
        image: result.image,
        technicalData
      }
    })
}

const enrichDescoMetadata = async (
  targets: Array<{ metadataIndex: number; material: MaterialLine }>,
  metadataItems: DescoMaterialMetadata[]
): Promise<DescoMaterialMetadata[]> => {
  if (targets.length === 0) return metadataItems

  const nextMetadata = [...metadataItems]
  const browser = await createDescoBrowser()

  try {
    await runWithConcurrency(targets, descoEnrichConcurrency, async ({ metadataIndex, material }) => {
      const page = await browser.newPage()

      try {
        await page.setUserAgent(descoBrowserUserAgent)
        const detailUrl = await findDescoDetailUrl(page, material)
        if (!detailUrl) return

        const detailMetadata = await scrapeDescoDetailMetadata(page, detailUrl, material)
        if (!detailMetadata) return

        nextMetadata[metadataIndex] = {
          ...nextMetadata[metadataIndex],
          articleNumber: nextMetadata[metadataIndex].articleNumber || material.articleNumber,
          productNumber: nextMetadata[metadataIndex].productNumber || material.productNumber,
          name: detailMetadata.name || nextMetadata[metadataIndex].name || material.name,
          description: detailMetadata.description || nextMetadata[metadataIndex].description,
          image: detailMetadata.image || nextMetadata[metadataIndex].image,
          technicalData: detailMetadata.technicalData || nextMetadata[metadataIndex].technicalData
        }
      } catch {
        return
      } finally {
        await page.close().catch(() => undefined)
      }
    })
  } finally {
    await browser.close()
  }

  return nextMetadata
}

const buildMetadataKeys = (
  item: Pick<MaterialLine, 'name' | 'articleNumber' | 'productNumber'> | DescoMaterialMetadata
): string[] => {
  return [normalizeKey(item.articleNumber), normalizeKey(item.productNumber), normalizeKey(item.name)].filter(
    (key): key is string => key.length > 0
  )
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

    return {
      ...item,
      description: item.description || metadata.description,
      image: item.image || metadata.image,
      technicalData: item.technicalData || metadata.technicalData
    }
  })
}

const readServerConfig = async (): Promise<JsonObject> => {
  try {
    const raw = await readFile('./server.config.json', 'utf8')
    return JSON.parse(raw) as JsonObject
  } catch {
    return {}
  }
}

const readDescoConfig = async (): Promise<DescoConfig> => {
  const config = await readServerConfig()
  const maybeDesco = config.desco

  if (!maybeDesco || typeof maybeDesco !== 'object') {
    return {}
  }

  const descoConfig = maybeDesco as JsonObject

  return {
    getAllProductsUrl: normalizeString(descoConfig.getAllProductsUrl),
    authorization: normalizeString(descoConfig.authorization),
    cookie: normalizeString(descoConfig.cookie),
    referer: normalizeString(descoConfig.referer),
    userAgent: normalizeString(descoConfig.userAgent)
  }
}

const getConfiguredDescoUrl = async (): Promise<string> => {
  const config = await readDescoConfig()
  return (
    config.getAllProductsUrl ||
    normalizeString(process.env.KEEPIT_DESCO_GET_ALL_PRODUCTS_URL) ||
    'https://www.desco.be/DesktopModules/Desco/RazorHost/DownloadHandlers/Excel.ashx?language=nl-BE'
  )
}

const getConfiguredAuthorization = async (): Promise<string> => {
  const config = await readDescoConfig()
  return config.authorization || normalizeString(process.env.KEEPIT_DESCO_AUTHORIZATION)
}

const getConfiguredCookie = async (): Promise<string> => {
  const config = await readDescoConfig()
  return config.cookie || normalizeString(process.env.KEEPIT_DESCO_COOKIE)
}

const getConfiguredReferer = async (): Promise<string> => {
  const config = await readDescoConfig()
  return config.referer || normalizeString(process.env.KEEPIT_DESCO_REFERER)
}

const getConfiguredUserAgent = async (): Promise<string> => {
  const config = await readDescoConfig()
  return config.userAgent || normalizeString(process.env.KEEPIT_DESCO_USER_AGENT)
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
      technicalData: existing.technicalData || item.technicalData
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

    return {
      source: 'desco',
      updatedAt: normalizeString(parsed.updatedAt),
      count: Number(parsed.count) || parsed.items.length,
      items: dedupeMaterials(parsed.items)
    }
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
 * Ensures that the metadata cache contains an entry for every article in the catalog.
 * If an article is missing, a stub entry is added (to be enriched later).
 * Existing metadata is preserved.
 */
export const seedDescoMetadata = async (materials?: MaterialLine[]): Promise<void> => {
  const metadataCatalog = await readDescoMetadataCatalog()
  const existingKeys = new Set(metadataCatalog.items.flatMap((item) => buildMetadataKeys(item)))

  if (!materials) {
    await writeDescoMetadataCatalog(metadataCatalog.items)
    return
  }

  const newMetadata: DescoMaterialMetadata[] = [...metadataCatalog.items]

  for (const mat of materials) {
    const keys = buildMetadataKeys(mat)
    if (keys.some((key) => existingKeys.has(key))) continue

    newMetadata.push({
      articleNumber: mat.articleNumber,
      productNumber: mat.productNumber,
      name: mat.name
    })
    keys.forEach((key) => existingKeys.add(key))
  }

  await writeDescoMetadataCatalog(newMetadata)
}

export const syncDescoCatalog = async (): Promise<DescoCatalog> => {
  // Download latest materials first
  const url = await getConfiguredDescoUrl()
  const authorization = await getConfiguredAuthorization()
  const cookie = await getConfiguredCookie()
  const referer = await getConfiguredReferer()
  const userAgent = await getConfiguredUserAgent()

  const headers: Record<string, string> = {
    Accept:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/plain;q=0.9, */*;q=0.8'
  }

  if (authorization) headers.Authorization = authorization
  if (cookie) headers.Cookie = cookie
  if (referer) headers.Referer = referer
  if (userAgent) headers['User-Agent'] = userAgent

  const response = await fetch(url, {
    method: 'GET',
    headers
  })

  if (!response.ok) {
    const fallbackCatalog = await readDescoCatalog()
    if (fallbackCatalog.items.length > 0) {
      return fallbackCatalog
    }
    const text = await response.text().catch(() => '')
    throw new Error(`Desco Excel download failed (${response.status}). ${text.slice(0, 200)}`)
  }

  const contentType =
    response.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const arrayBuffer = await response.arrayBuffer()
  const binary = Buffer.from(arrayBuffer)
  const utf8Text = Buffer.from(arrayBuffer).toString('utf8')
  const raw = utf8Text.includes('\uFFFD') ? Buffer.from(arrayBuffer).toString('latin1') : utf8Text
  const items = parseDescoMaterials(raw, contentType, binary)

  if (items.length === 0) {
    const fallbackCatalog = await readDescoCatalog()
    if (fallbackCatalog.items.length > 0) {
      return fallbackCatalog
    }
    throw new Error('Desco Excel returned no material entries. Check file format or website availability.')
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
