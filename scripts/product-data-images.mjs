#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import * as XLSX from 'xlsx'

const DATABASE_DIR = resolve('.database')
const CATALOG_PATH = resolve(DATABASE_DIR, 'alelek-materials.json')
const OVERRIDES_PATH = resolve(DATABASE_DIR, 'alelek-manufacturer-overrides.json')
const ASSET_ROOT = resolve(DATABASE_DIR, 'catalog-assets')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.bmp'])
const PROVIDER_PAGES = {
  installdata: 'https://www.installdata.be/',
  techlink: 'https://techlinkportal.be/',
  sieportal: 'https://mall.industry.siemens.com/',
  lithoss: 'https://www.lithoss.com/en/etim'
}

const PROVIDER_LABELS = {
  installdata: 'InstallData ETIM/BMEcat',
  techlink: 'Techlink Data Portal export',
  sieportal: 'Siemens SiePortal productmaster',
  lithoss: 'Lithoss officiële BMEcat'
}

const normalizeId = (value = '') =>
  String(value)
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
const normalizeBrand = (value = '') => normalizeId(value).replace(/(electrics?|electric|group|ag|nv|sa|gmbh)$/i, '')
const decodeXml = (value = '') =>
  String(value)
    .replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .trim()

const xmlValue = (block, names) => {
  for (const name of names) {
    const match = block.match(
      new RegExp(`<(?:[\\w.-]+[.:])?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+[.:])?${name}>`, 'i')
    )
    if (match)
      return decodeXml(match[1])
        .replace(/<[^>]+>/g, ' ')
        .trim()
  }
  return ''
}

const imageFromXmlBlock = (block) => {
  const mimeBlocks = block.match(/<(?:[\w.-]+[.:])?MIME\b[\s\S]*?<\/(?:[\w.-]+[.:])?MIME>/gi) || []
  const candidates = []
  for (const mime of mimeBlocks) {
    const type = xmlValue(mime, ['MIME_TYPE'])
    const source = xmlValue(mime, ['MIME_SOURCE', 'MIME_URL', 'MIME_DESCR'])
    if (!source || (!/^image\//i.test(type) && !IMAGE_EXTENSIONS.has(extname(source.split(/[?#]/)[0]).toLowerCase())))
      continue
    const designation = xmlValue(mime, ['MIME_DESIGNATION', 'MIME_PURPOSE']).toLowerCase()
    const code = xmlValue(mime, ['MIME_CODE']).toUpperCase()
    const score = (designation === 'detail' ? 20 : 0) + (code === 'MD01' ? 10 : 0) - (code === 'MD47' ? 100 : 0)
    candidates.push({ source, score })
  }
  return candidates.sort((left, right) => right.score - left.score)[0]?.source || ''
}

export const parseInstallDataXml = (xml) => {
  const blocks =
    xml.match(/<(?:[\w.-]+[.:])?(?:ARTICLE|PRODUCT)\b[\s\S]*?<\/(?:[\w.-]+[.:])?(?:ARTICLE|PRODUCT)>/gi) || []
  return blocks
    .map((block) => ({
      brand: xmlValue(block, ['MANUFACTURER_NAME', 'BRAND_NAME', 'UDX.EDXF.BRAND_NAME']),
      mpn: xmlValue(block, [
        'MANUFACTURER_PID',
        'MANUFACTURER_AID',
        'PRODUCT_ID',
        'SUPPLIER_PID',
        'SUPPLIER_AID',
        'ARTICLE_ID',
        'ART_ID'
      ]),
      ean: xmlValue(block, ['INTERNATIONAL_PID', 'GTIN', 'EAN']),
      imageSource: imageFromXmlBlock(block)
    }))
    .filter((record) => (record.ean || record.mpn) && record.imageSource)
}

const valueFromRow = (row, aliases) => {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeId(key), String(value ?? '').trim()]))
  for (const alias of aliases) {
    const value = normalized.get(normalizeId(alias))
    if (value) return value
  }
  return ''
}

export const parseProductMasterRows = (rows, defaultBrand = '') =>
  rows
    .map((row) => ({
      brand: valueFromRow(row, ['manufacturer', 'manufacturer name', 'brand', 'merk']) || defaultBrand,
      mpn: valueFromRow(row, [
        'manufacturer pid',
        'manufacturer product number',
        'manufacturer article number',
        'order number',
        'product number',
        'article number',
        'artikelnummer',
        'bestelnummer',
        'mlfb',
        'order no',
        'article no'
      ]),
      ean: valueFromRow(row, ['gtin', 'ean', 'ean13', 'international pid']),
      imageSource: valueFromRow(row, [
        'product image',
        'product picture',
        'image',
        'image file',
        'image filename',
        'picture',
        'picture file',
        'mime source',
        'foto'
      ])
    }))
    .filter((record) => record.ean || record.mpn)

const walk = async (directory) => {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await walk(path)))
    else result.push(path)
  }
  return result
}

const readRows = async (path) => {
  const workbook = XLSX.read(await readFile(path), { type: 'buffer', raw: false })
  return workbook.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' }))
}

const extractInput = async (inputPath) => {
  const absolute = resolve(inputPath)
  const inputStat = await stat(absolute)
  if (inputStat.isDirectory()) {
    const archives = (await readdir(absolute, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.zip')
      .sort((left, right) => left.name.localeCompare(right.name))
    if (!archives.length) return { directory: absolute, cleanup: async () => {} }
    const temporary = await mkdtemp(join(tmpdir(), 'keepit-product-data-batch-'))
    for (const [index, archive] of archives.entries()) {
      const destination = join(temporary, String(index + 1).padStart(3, '0'))
      await mkdir(destination, { recursive: true })
      const result = spawnSync('unzip', ['-qq', join(absolute, archive.name), '-d', destination], { stdio: 'pipe' })
      if (result.status !== 0) {
        await rm(temporary, { recursive: true, force: true })
        throw new Error(`Kon ${archive.name} niet uitpakken: ${String(result.stderr || result.error || '').trim()}`)
      }
    }
    return {
      directory: temporary,
      cleanup: () => rm(temporary, { recursive: true, force: true }),
      inputLabel: `${archives.length} ZIP-bestanden uit ${basename(absolute)}`
    }
  }
  if (extname(absolute).toLowerCase() !== '.zip') return { directory: absolute, cleanup: async () => {} }
  const temporary = await mkdtemp(join(tmpdir(), 'keepit-product-data-'))
  const result = spawnSync('unzip', ['-qq', absolute, '-d', temporary], { stdio: 'pipe' })
  if (result.status !== 0) {
    await rm(temporary, { recursive: true, force: true })
    throw new Error(`Kon ZIP niet uitpakken: ${String(result.stderr || result.error || '').trim()}`)
  }
  return {
    directory: temporary,
    cleanup: () => rm(temporary, { recursive: true, force: true }),
    inputLabel: basename(absolute)
  }
}

const collectProviderRecords = async (provider, directory) => {
  const files = await walk(directory)
  const images = files.filter((path) => IMAGE_EXTENSIONS.has(extname(path).toLowerCase()))
  const records = []
  const appendRecords = (newRecords) => {
    for (const record of newRecords) records.push(record)
  }
  for (const path of files) {
    const extension = extname(path).toLowerCase()
    if (extension === '.xml') appendRecords(parseInstallDataXml(await readFile(path, 'utf8')))
    if (['.csv', '.xlsx', '.xls'].includes(extension)) {
      appendRecords(parseProductMasterRows(await readRows(path), provider === 'sieportal' ? 'Siemens' : ''))
    }
  }

  return { files, images, records }
}

export const siemensAssetKey = (value = '') => {
  const filename = basename(String(value).split(/[?#]/)[0])
  const stem = filename.slice(0, filename.length - extname(filename).length)
  return /^[GPS]_.+[ijp]$/i.test(stem) ? stem.slice(0, -1).toLowerCase() : ''
}

const siemensImagePreference = (path) => {
  const stem = basename(path, extname(path))
  if (/P$/i.test(stem) && extname(path).toLowerCase() === '.png') return 3
  if (/P$/i.test(stem)) return 2
  return 1
}

const buildFileIndex = (files) => {
  const byName = new Map()
  const bySiemensKey = new Map()
  const images = []
  for (const path of files) {
    if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) continue
    images.push(path)
    byName.set(basename(path).toLowerCase(), path)
    const key = siemensAssetKey(path)
    const current = bySiemensKey.get(key)
    if (key && (!current || siemensImagePreference(path) > siemensImagePreference(current))) {
      bySiemensKey.set(key, path)
    }
  }
  return { byName, bySiemensKey, images }
}

const findImagePath = (record, directory, fileIndex, referenceImage = '') => {
  const source = String(record.imageSource || '').trim()
  if (/^https?:\/\//i.test(source)) return source
  if (source) {
    const exact = resolve(directory, source.replaceAll('\\', '/'))
    const byName = fileIndex.byName.get(basename(source).toLowerCase())
    if (fileIndex.images.includes(exact)) return exact
    if (byName) return byName
  }
  const siemensMatch = fileIndex.bySiemensKey.get(siemensAssetKey(referenceImage))
  if (siemensMatch) return siemensMatch
  const identifiers = [record.mpn, record.ean].map(normalizeId).filter((value) => value.length >= 5)
  return fileIndex.images.find((path) => {
    const stem = normalizeId(basename(path, extname(path)))
    return identifiers.some((identifier) => stem === identifier || stem.startsWith(identifier))
  })
}

const buildCatalogIndex = (items) => {
  const ean = new Map()
  const mpn = new Map()
  const mpnOnly = new Map()
  const add = (map, key, index) => {
    if (!key) return
    const values = map.get(key) || []
    values.push(index)
    map.set(key, values)
  }
  items.forEach((item, index) => {
    const itemBrand = normalizeBrand(item.technicalData?.Merk || item.manufacturerData?.Merk)
    const itemMpn = normalizeId(
      item.technicalData?.['Artikelcode leverancier'] || item.manufacturerData?.MPN || item.productNumber
    )
    const itemEan = normalizeId(item.technicalData?.EAN || item.manufacturerData?.GTIN)
    if (itemEan.length >= 8) add(ean, itemEan, index)
    if (itemMpn.length >= 4) {
      add(mpn, `${itemBrand}|${itemMpn}`, index)
      add(mpnOnly, itemMpn, index)
    }
  })
  return { ean, mpn, mpnOnly }
}

const matchRecord = (record, index) => {
  const ean = normalizeId(record.ean)
  if (ean.length >= 8 && index.ean.has(ean)) return { indices: index.ean.get(ean), method: 'EAN/GTIN exact' }
  const mpn = normalizeId(record.mpn)
  const brand = normalizeBrand(record.brand)
  if (mpn && brand && index.mpn.has(`${brand}|${mpn}`))
    return { indices: index.mpn.get(`${brand}|${mpn}`), method: 'Merk + MPN exact' }
  const byMpn = index.mpnOnly.get(mpn) || []
  if (mpn.length >= 5 && byMpn.length === 1) return { indices: byMpn, method: 'Unieke MPN exact' }
  return null
}

const storeLocalAsset = async (provider, sourcePath) => {
  const buffer = await readFile(sourcePath)
  const hash = createHash('sha256').update(buffer).digest('hex')
  const extension = extname(sourcePath).toLowerCase() || '.img'
  const directory = resolve(ASSET_ROOT, provider)
  await mkdir(directory, { recursive: true })
  const destination = resolve(directory, `${hash}${extension}`)
  try {
    await copyFile(sourcePath, destination, 0)
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  return `/catalog-assets/${provider}/${basename(destination)}`
}

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const writeJsonAtomic = async (path, value) => {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

const parseArgs = (argv) => {
  const provider = String(argv[0] || '').toLowerCase()
  const input = argv[1]
  if (!['installdata', 'techlink', 'sieportal', 'lithoss'].includes(provider) || !input) {
    throw new Error('Gebruik: npm run images:import -- installdata|techlink|sieportal|lithoss /pad/naar/export.zip [--apply]')
  }
  return { provider, input, apply: argv.includes('--apply') }
}

export const runProductDataImageImport = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv)
  const extracted = await extractInput(options.input)
  try {
    const catalog = await readJson(CATALOG_PATH, { items: [] })
    if (!Array.isArray(catalog.items) || !catalog.items.length) throw new Error('Alelek-catalogus is leeg')
    const { files, records } = await collectProviderRecords(options.provider, extracted.directory)
    const fileIndex = buildFileIndex(files)
    const catalogIndex = buildCatalogIndex(catalog.items)
    const overrides = await readJson(OVERRIDES_PATH, { version: 1, updatedAt: '', items: {} })
    const matched = new Map()
    let ambiguous = 0
    let missingImage = 0

    for (const record of records) {
      const match = matchRecord(record, catalogIndex)
      if (!match) {
        ambiguous += 1
        continue
      }
      let foundImage = false
      for (const index of match.indices) {
        const source = findImagePath(record, extracted.directory, fileIndex, catalog.items[index]?.image)
        if (!source) continue
        foundImage = true
        if (!matched.has(index)) matched.set(index, { record, source, method: match.method })
      }
      if (!foundImage) missingImage += 1
    }

    console.log(
      `${options.provider}: ${records.length} records, ${matched.size} exacte catalogusmatches, ${ambiguous} niet uniek/ongekend, ${missingImage} zonder beeldbestand.`
    )
    if (!options.apply) {
      console.log('Dry-run: voeg --apply toe om beelden en catalogus bij te werken.')
      return { records: records.length, matched: matched.size, applied: 0 }
    }

    const backupDirectory = resolve(
      DATABASE_DIR,
      'backups',
      `product-data-${options.provider}-${new Date().toISOString().replaceAll(':', '-')}`
    )
    await mkdir(backupDirectory, { recursive: true })
    await cp(CATALOG_PATH, resolve(backupDirectory, 'alelek-materials.json'))
    try {
      await cp(OVERRIDES_PATH, resolve(backupDirectory, 'alelek-manufacturer-overrides.json'))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    let applied = 0
    for (const [index, value] of matched) {
      const item = catalog.items[index]
      const image = /^https?:\/\//i.test(value.source)
        ? value.source
        : await storeLocalAsset(options.provider, value.source)
      const fetchedAt = new Date().toISOString()
      const dataSource = {
        provider: PROVIDER_LABELS[options.provider],
        pageUrl: PROVIDER_PAGES[options.provider],
        productNumber: String(value.record.mpn || value.record.ean),
        fetchedAt
      }
      const dataSources = [...(item.dataSources || []), dataSource]
      item.image = image
      item.enrichedAt = fetchedAt
      item.manufacturerData = {
        ...(item.manufacturerData || {}),
        ...(value.record.brand ? { Merk: value.record.brand } : {}),
        ...(value.record.mpn ? { MPN: value.record.mpn } : {}),
        ...(value.record.ean ? { GTIN: value.record.ean } : {}),
        Importbestand: extracted.inputLabel || basename(options.input),
        Beeldmatch: value.method
      }
      item.dataSources = [
        ...new Map(dataSources.map((source) => [`${source.provider}|${source.pageUrl}`, source])).values()
      ]
      const key = String(item.articleNumber || item.productNumber || '')
      overrides.items[key] = {
        image: item.image,
        manufacturerData: item.manufacturerData,
        dataSources: item.dataSources,
        imageCandidates: item.imageCandidates,
        enrichedAt: item.enrichedAt
      }
      applied += 1
      if (applied % 250 === 0 || applied === matched.size) {
        console.log(`  ${applied}/${matched.size} officiële beelden voorbereid`)
      }
    }
    const timestamp = new Date().toISOString()
    catalog.updatedAt = timestamp
    overrides.updatedAt = timestamp
    await writeJsonAtomic(CATALOG_PATH, catalog)
    await writeJsonAtomic(OVERRIDES_PATH, overrides)
    console.log(`✓ ${applied} beelden toegepast. Voer nu npm run sync:finish uit voor lokale WebP's.`)
    return { records: records.length, matched: matched.size, applied }
  } finally {
    await extracted.cleanup()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runProductDataImageImport().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
