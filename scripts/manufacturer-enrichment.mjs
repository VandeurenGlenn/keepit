#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DATABASE_DIR = resolve('.database')
const CATALOG_PATH = resolve(DATABASE_DIR, 'desco-materials.json')
const METADATA_PATH = resolve(DATABASE_DIR, 'desco-materials.metadata.json')
const STATE_PATH = resolve(DATABASE_DIR, 'manufacturer-enrichment-state.json')
const CACHE_DIR = resolve(DATABASE_DIR, 'manufacturer-cache')
const DEFAULT_DELAY_MS = 5000
const DEFAULT_DAILY_LIMIT = 100

const decodeHtml = (value = '') =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const normalizeSku = (value = '') => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase()

const knownBrands = [
  ['Ideal Standard', /\bideal standard\b/i],
  ['GF Piping Systems', /\b(gf piping|georg fischer)\b/i],
  ['Grundfos', /\bgrundfos\b/i],
  ['Hansgrohe', /\bhansgrohe\b/i],
  ['Geberit', /\bgeberit\b/i],
  ['Vaillant', /\bvaillant\b/i],
  ['Viega', /\bviega\b/i],
  ['Bosch', /\b(bosch|junkers)\b/i],
  ['Grohe', /\bgrohe\b/i],
  ['Caleffi', /\bcaleffi\b/i],
  ['Delabie', /\bdelabie\b/i],
  ['RIDGID', /\bridgid\b/i],
  ['Comap', /\bcomap\b/i],
  ['Giacomini', /\bgiacomini\b/i],
  ['Ariston', /\bariston\b/i],
  ['OLI', /\boli\b/i],
  ['ACV', /\bacv\b/i]
]

export const detectManufacturer = (item) =>
  knownBrands.find(([, expression]) => expression.test(`${item.name || ''} ${item.description || ''}`))?.[0]

const firstMatch = (html, expression) => decodeHtml(html.match(expression)?.[1] || '')

export const parseBoschProductPage = (html, expectedSku, pageUrl) => {
  const normalizedSku = normalizeSku(expectedSku)
  const skuEvidence = [
    ...html.matchAll(/data-item-mfact=["']([^"']+)["']/gi),
    ...html.matchAll(/Bestelnummer[\s\S]{0,500}?([0-9][0-9 .-]{7,})/gi)
  ].map((match) => normalizeSku(match[1]))

  if (!normalizedSku || !skuEvidence.includes(normalizedSku)) return null

  const title =
    firstMatch(html, /<h3[^>]*class=["'][^"']*\bHl-3\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) ||
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*-\s*Onderdelen catalogus\s*$/i, '')

  const technicalData = {}
  const specificationTable =
    html.match(/<div[^>]*class=["'][^"']*\bImageTable_table\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''
  for (const row of specificationTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => decodeHtml(cell[1]))
    if (cells.length >= 2 && cells[0] && cells[1]) technicalData[cells[0]] = cells[1]
  }

  const imagePath = html.match(/<img[^>]+src=["']([^"']*\/web-etk\/documents\/img\?id=\d+)["']/i)?.[1]
  const imageUrl = imagePath ? new URL(decodeHtml(imagePath), pageUrl).href : undefined

  return { title, technicalData, imageUrl }
}

export const parseIcecatProduct = (raw, expectedSku, expectedBrand) => {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  if (payload?.msg !== 'OK' || !payload?.data) return null

  const general = payload.data.GeneralInfo || payload.data.EssentialInfo || {}
  const productCode = general.BrandPartCode || general.ProductCode || payload.data.EssentialInfo?.ProductCode || ''
  const brand = general.Brand || payload.data.EssentialInfo?.Brand || ''
  if (normalizeSku(productCode) !== normalizeSku(expectedSku)) return null
  if (normalizeSku(brand) !== normalizeSku(expectedBrand)) return null

  const gtins = general.GTINs || general.GTIN || payload.data.EssentialInfo?.GTINs || []
  const gtinValues = gtins
    .map((entry) => (typeof entry === 'string' ? entry : entry?.Value || entry?.GTIN || ''))
    .filter(Boolean)
  const gallery = Array.isArray(payload.data.Gallery) ? payload.data.Gallery : []
  const mainImage = gallery.find((entry) => entry.IsMain === 'Y') || gallery[0]
  const title = general.Title || payload.data.Title || general.ProductName || ''
  const category = general.Category?.Name?.Value || general.Category?.Name || ''

  return {
    title,
    description: decodeHtml(general.Description?.LongDesc || ''),
    technicalData: {
      Merk: brand,
      MPN: productCode,
      ...(gtinValues.length ? { GTIN: gtinValues.join(', ') } : {}),
      ...(category ? { Categorie: category } : {})
    },
    imageUrl: mainImage?.Pic || mainImage?.Pic500x500 || mainImage?.LowPic,
    rightsStatus: 'licensed',
    icecatId: general.IcecatId || payload.data.GeneralInfo?.IcecatId
  }
}

const decodeJsonString = (value = '') => {
  try {
    return JSON.parse(`"${value}"`)
  } catch {
    return value.replaceAll('\\u0026', '&').replaceAll('\\"', '"').replaceAll('\\/', '/')
  }
}

export const parseGeberitProductPage = (html, expectedSku, pageUrl) => {
  const normalizedSku = normalizeSku(expectedSku)
  if (!normalizedSku) return null

  const articles = new Map()
  for (const match of html.matchAll(/Art\. nr\.<\/td>[\s\S]{0,500}?<div>([^<]+)<\/div>/gi)) {
    const articleNumber = decodeHtml(match[1])
    articles.set(normalizeSku(articleNumber), { articleNumber })
  }
  for (const match of html.matchAll(/\\"id\\":\\"([^"\\]+)\\"[\s\S]{0,600}?\\"name\\":\\"([\s\S]*?)\\"/gi)) {
    const articleNumber = decodeJsonString(match[1])
    articles.set(normalizeSku(articleNumber), { articleNumber, name: decodeJsonString(match[2]) })
  }
  const exactArticle = articles.get(normalizedSku)
  if (!exactArticle) return null

  const pageTitle = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const isSparePartOverview = /\/spare-part\//i.test(pageUrl)
  let imageUrl = html.match(/<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["'](https:\/\/images\.data\.geberit\.com\/[^"']+)["']/i)?.[1]
  if (!imageUrl) {
    imageUrl = html.match(/\\"type\\":\\"Primary Image\\"[\s\S]{0,1200}?\\"size\\":\\"M\\",\\"url\\":\\"(https:\/\/images\.data\.geberit\.com\/[^"\\]+)\\"/i)?.[1]
  }
  imageUrl = imageUrl ? decodeHtml(decodeJsonString(imageUrl)) : undefined

  const technicalData = {
    Merk: 'Geberit',
    'Art. nr.': exactArticle.articleNumber,
    Beeldtype: isSparePartOverview ? 'Overzichtstekening van bijhorend toestel' : 'Officieel productfamiliebeeld'
  }
  const technicalSection = html.match(/>Technische gegevens<\/h2>([\s\S]*?)(?:<h2|$)/i)?.[1] || ''
  for (const row of technicalSection.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtml(cell[1]))
    if (cells.length >= 2 && cells[0] && cells[1]) technicalData[cells[0]] = cells[1]
  }

  return {
    title: exactArticle.name || pageTitle,
    technicalData,
    imageUrl,
    publishableImage: !isSparePartOverview,
    rightsStatus: 'permission-required'
  }
}

const knownGeberitPages = new Map([
  ['361861001', 'https://catalog.geberit.be/nl-BE/product/PRO_101949'],
  ['240468211', 'https://catalog.geberit.be/nl-BE/spare-part/SPT_461543']
])

export const parseViegaProductPage = (html, expectedSku) => {
  const normalizedSku = normalizeSku(expectedSku)
  const articleNumbers = [...html.matchAll(/\b(\d{3})[\s.]?(\d{3})\b/g)].map((match) => normalizeSku(`${match[1]}${match[2]}`))
  if (!normalizedSku || !articleNumbers.includes(normalizedSku)) return null

  const title = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
  const description = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  const imageUrl = decodeHtml(
    html.match(/https:\/\/web-catalog\.viega\.com\/Images\/PP[^"'\s>]+\.(?:jpg|png|webp)/i)?.[0] || ''
  ) || undefined
  const model = title.match(/\bmodel\s+(.+)$/i)?.[1] || description.match(/-\s*([\d.]+XL)\s*$/i)?.[1]

  return {
    title: title.replace(/\s*-\s*model\s+.+$/i, ''),
    description,
    technicalData: {
      Merk: 'Viega',
      Artikel: String(expectedSku),
      ...(model ? { Model: model } : {}),
      Beeldtype: 'Officieel productfamiliebeeld'
    },
    imageUrl,
    publishableImage: true,
    rightsStatus: 'permission-required'
  }
}

const VIEGA_BASE = 'https://www.viega.be/nl/producten/Catalogus/Leidingtechniek/Profipress/Bochten'
const knownViegaPages = new Map([
  ['476847', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416XL.html`],
  ['476854', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416XL.html`],
  ['476878', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416-1XL.html`],
  ['476885', `${VIEGA_BASE}/Profipress-XL-Bocht-90-2416-1XL.html`],
  ['476908', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426XL.html`],
  ['476915', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426XL.html`],
  ['476939', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426-1XL.html`],
  ['476946', `${VIEGA_BASE}/Profipress-XL-Bocht-45-2426-1XL.html`]
])

const adapters = {
  bosch: {
    label: 'Bosch Home Comfort',
    domain: 'www.bosch-homecomfort.com',
    matches: (item) => /\b(bosch|junkers)\b/i.test(item.name || '') && Boolean(item.productNumber),
    url: (sku) => `https://www.bosch-homecomfort.com/web-etk/be/bosch/be/nl/sparepart/${encodeURIComponent(sku)}`,
    parse: parseBoschProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  icecat: {
    label: 'Open Icecat',
    domain: 'live.icecat.biz',
    matches: (item) => Boolean(detectManufacturer(item) && item.productNumber),
    url: (sku, item, options) => {
      const params = new URLSearchParams({
        shopname: options.icecatUsername,
        lang: 'nl',
        Brand: detectManufacturer(item),
        ProductCode: sku,
        content: 'title,gallery,essentialinfo,generalinfo'
      })
      if (options.icecatAppKey) params.set('app_key', options.icecatAppKey)
      return `https://live.icecat.biz/api?${params}`
    },
    parse: (raw, sku, _requestUrl, item) => parseIcecatProduct(raw, sku, detectManufacturer(item)),
    publicUrl: (item, result) => {
      const query = encodeURIComponent(`${detectManufacturer(item)} ${item.productNumber}`)
      return result.icecatId
        ? `https://icecat.biz/nl/search?keyword=${query}&icecat_id=${result.icecatId}`
        : `https://icecat.biz/nl/search?keyword=${query}`
    }
  },
  geberit: {
    label: 'Geberit productcatalogus',
    domain: 'catalog.geberit.be',
    matches: (item) =>
      /\bgeberit\b/i.test(`${item.name || ''} ${item.description || ''}`) &&
      knownGeberitPages.has(normalizeSku(item.productNumber)),
    url: (sku) => knownGeberitPages.get(normalizeSku(sku)),
    parse: parseGeberitProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  },
  viega: {
    label: 'Viega productcatalogus',
    domain: 'www.viega.be',
    matches: (item) =>
      /\bviega\b/i.test(`${item.name || ''} ${item.description || ''}`) &&
      knownViegaPages.has(normalizeSku(item.productNumber)),
    url: (sku) => knownViegaPages.get(normalizeSku(sku)),
    parse: parseViegaProductPage,
    publicUrl: (_item, _result, requestUrl) => requestUrl
  }
}

const parseArgs = (argv) => {
  const valueAfter = (name) => {
    const arg = argv.find((entry) => entry.startsWith(`${name}=`))
    return arg?.slice(name.length + 1)
  }
  const number = (name, fallback, minimum) => {
    const parsed = Number(valueAfter(name))
    return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback
  }
  return {
    brands: (valueAfter('--brands') || 'bosch').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
    sku: normalizeSku(valueAfter('--sku') || ''),
    max: number('--max', 10, 1),
    delayMs: number('--delay-ms', DEFAULT_DELAY_MS, 1000),
    dailyLimit: number('--daily-limit', DEFAULT_DAILY_LIMIT, 1),
    apply: argv.includes('--apply'),
    publishImages: argv.includes('--publish-images'),
    reprocess: argv.includes('--reprocess'),
    resetIcecatCircuit: argv.includes('--reset-icecat-circuit'),
    refresh: argv.includes('--refresh'),
    icecatUsername: process.env.ICECAT_USERNAME || '',
    icecatAppKey: process.env.ICECAT_APP_KEY || ''
  }
}

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const writeJsonAtomic = async (path, value) => {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

const today = () => new Date().toISOString().slice(0, 10)
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
const cachePathFor = (brand, url) => resolve(CACHE_DIR, brand, `${createHash('sha256').update(url).digest('hex')}.html`)

const fetchControlled = async ({ brand, url, options, state }) => {
  const adapter = adapters[brand]
  const domainState = state.domains[adapter.domain] || { date: today(), requests: 0 }
  if (domainState.date !== today()) Object.assign(domainState, { date: today(), requests: 0, blockedAt: undefined })
  state.domains[adapter.domain] = domainState

  if (domainState.blockedAt) throw new Error(`${adapter.domain} circuit breaker staat open sinds ${domainState.blockedAt}`)
  if (domainState.requests >= options.dailyLimit) throw new Error(`${adapter.domain} daglimiet (${options.dailyLimit}) bereikt`)

  const cachePath = cachePathFor(brand, url)
  if (!options.refresh) {
    try {
      return { html: await readFile(cachePath, 'utf8'), cached: true }
    } catch {
      // Cache miss.
    }
  }

  const elapsed = Date.now() - Number(domainState.lastRequestAt || 0)
  if (elapsed < options.delayMs) await sleep(options.delayMs - elapsed)

  domainState.lastRequestAt = Date.now()
  domainState.requests += 1
  await writeJsonAtomic(STATE_PATH, state)

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'KeepitCatalogEnrichment/1.0 (rate-limited product verification)'
    },
    redirect: 'follow'
  })

  if (response.status === 403 && brand === 'icecat') {
    domainState.consecutiveRestricted = Number(domainState.consecutiveRestricted || 0) + 1
    if (domainState.consecutiveRestricted < 3) {
      await writeJsonAtomic(STATE_PATH, state)
      return { html: '', status: 403, cached: false, restricted: true }
    }
  } else if (response.ok || response.status === 404) {
    domainState.consecutiveRestricted = 0
  }

  if (response.status === 403 || response.status === 429) {
    domainState.blockedAt = new Date().toISOString()
    domainState.blockedStatus = response.status
    domainState.retryAfter = response.headers.get('retry-after') || undefined
    await writeJsonAtomic(STATE_PATH, state)
    throw new Error(`${adapter.domain} antwoordde ${response.status}; circuit breaker geopend`)
  }
  if (!response.ok) return { html: '', status: response.status, cached: false }

  const html = await response.text()
  await mkdir(resolve(CACHE_DIR, brand), { recursive: true })
  await writeFile(cachePath, html, 'utf8')
  return { html, status: response.status, cached: false }
}

const uniqueBy = (items, keyFor) => [...new Map(items.map((item) => [keyFor(item), item])).values()]

const mergeEnrichment = (item, result, brand, pageUrl, fetchedAt, publishImages = false) => {
  const adapter = adapters[brand]
  const source = { provider: adapter.label, pageUrl, productNumber: item.productNumber, fetchedAt }
  const manufacturerData = { ...result.technicalData }
  if (result.title) manufacturerData.Productnaam = result.title
  const imageCandidate = result.imageUrl
    ? {
        url: result.imageUrl,
        sourceUrl: pageUrl,
        provider: adapter.label,
        rightsStatus: result.rightsStatus || 'permission-required',
        checkedAt: fetchedAt
      }
    : undefined

  return {
    ...item,
    image: item.image || (publishImages && result.publishableImage !== false ? result.imageUrl : undefined),
    description: item.description || result.description || undefined,
    manufacturerData,
    dataSources: uniqueBy([...(item.dataSources || []), source], (entry) => `${entry.provider}|${entry.pageUrl}`),
    imageCandidates: imageCandidate
      ? uniqueBy([...(item.imageCandidates || []), imageCandidate], (entry) => entry.url)
      : item.imageCandidates,
    enrichedAt: fetchedAt
  }
}

const usage = () => {
  console.log('Gebruik: npm run enrich:manufacturers -- [--brands=bosch,icecat,geberit,viega] [--sku=7735502304] [--max=10] [--delay-ms=5000] [--daily-limit=100] [--apply] [--publish-images] [--reprocess] [--refresh] [--reset-icecat-circuit]')
  console.log('Zonder --apply wordt niets aan catalogus of metadata gewijzigd.')
}

export const runManufacturerEnrichment = async (argv = process.argv.slice(2)) => {
  if (argv.includes('--help') || argv.includes('-h')) return usage()
  const options = parseArgs(argv)
  const serverConfig = await readJson(resolve('server.config.json'), {})
  options.icecatUsername ||= String(serverConfig.icecat?.username || '').trim()
  options.icecatAppKey ||= String(serverConfig.icecat?.appKey || '').trim()
  const unknownBrands = options.brands.filter((brand) => !adapters[brand])
  if (unknownBrands.length) throw new Error(`Nog geen veilige adapter voor: ${unknownBrands.join(', ')}`)
  if (options.brands.includes('icecat') && !options.icecatUsername) {
    throw new Error(
      'Icecat-gebruikersnaam ontbreekt. Vul icecat.username in server.config.json in of stel ICECAT_USERNAME in.'
    )
  }

  await mkdir(DATABASE_DIR, { recursive: true })
  const catalog = await readJson(CATALOG_PATH, { items: [] })
  const metadata = await readJson(METADATA_PATH, { source: 'desco-metadata', items: [] })
  const state = await readJson(STATE_PATH, { version: 1, domains: {}, products: {} })
  if (options.resetIcecatCircuit && state.domains?.['live.icecat.biz']?.blockedStatus === 403) {
    delete state.domains['live.icecat.biz'].blockedAt
    delete state.domains['live.icecat.biz'].blockedStatus
    delete state.domains['live.icecat.biz'].retryAfter
    state.domains['live.icecat.biz'].consecutiveRestricted = 0
    await writeJsonAtomic(STATE_PATH, state)
  }
  if (!Array.isArray(catalog.items) || catalog.items.length === 0) throw new Error('Desco-catalogus is leeg; voer eerst sync desco uit.')

  const itemKey = (item) => String(item.articleNumber || item.productNumber || item.name || '')
  const metadataByArticle = new Map((metadata.items || []).map((item) => [itemKey(item), item]))
  let attempted = 0
  let matched = 0
  let cacheHits = 0

  for (const brand of options.brands) {
    const adapter = adapters[brand]
    const candidates = catalog.items.filter(
      (item) => adapter.matches(item) && (!options.sku || normalizeSku(item.productNumber) === options.sku)
    )
    for (const catalogItem of candidates) {
      if (attempted >= options.max) break
      const sku = String(catalogItem.productNumber || '').trim()
      const stateKey = `${brand}:${normalizeSku(sku)}`
      if (!options.refresh && !options.reprocess && state.products[stateKey]?.status) continue

      attempted += 1
      const requestUrl = adapter.url(sku, catalogItem, options)
      const response = await fetchControlled({ brand, url: requestUrl, options, state })
      if (response.cached) cacheHits += 1
      const result = response.html ? adapter.parse(response.html, sku, requestUrl, catalogItem) : null
      const fetchedAt = new Date().toISOString()
      const pageUrl = result ? adapter.publicUrl(catalogItem, result, requestUrl) : adapter.publicUrl(catalogItem, {}, requestUrl)
      state.products[stateKey] = {
        brand,
        sku,
        pageUrl,
        checkedAt: fetchedAt,
        status: result
          ? 'matched'
          : response.restricted
            ? 'restricted'
            : response.status === 404
              ? 'not-found'
              : 'unverified',
        httpStatus: response.status || 200
      }

      if (result) {
        matched += 1
        const catalogIndex = catalog.items.indexOf(catalogItem)
        catalog.items[catalogIndex] = mergeEnrichment(
          catalogItem,
          result,
          brand,
          pageUrl,
          fetchedAt,
          options.publishImages
        )
        const existingMetadata = metadataByArticle.get(itemKey(catalogItem)) || catalogItem
        const enrichedMetadata = mergeEnrichment(
          existingMetadata,
          result,
          brand,
          pageUrl,
          fetchedAt,
          options.publishImages
        )
        metadataByArticle.set(itemKey(catalogItem), enrichedMetadata)
        console.log(`✓ ${adapter.label} ${sku}: exacte match${response.cached ? ' (cache)' : ''}`)
      } else {
        console.log(
          response.restricted
            ? `- ${adapter.label} ${sku}: merktoegang vereist (403)`
            : `- ${adapter.label} ${sku}: geen exacte match (${response.status || 200})`
        )
      }
      await writeJsonAtomic(STATE_PATH, state)
    }
  }

  if (options.apply && matched > 0) {
    const timestamp = new Date().toISOString()
    const backupDirectory = resolve(DATABASE_DIR, 'backups', `manufacturer-enrichment-${timestamp.replaceAll(':', '-')}`)
    await mkdir(backupDirectory, { recursive: true })
    await copyFile(CATALOG_PATH, resolve(backupDirectory, 'desco-materials.json'))
    try {
      await copyFile(METADATA_PATH, resolve(backupDirectory, 'desco-materials.metadata.json'))
    } catch {
      // Metadata may not exist on a fresh installation.
    }
    catalog.updatedAt = timestamp
    metadata.updatedAt = timestamp
    metadata.items = catalog.items.map((item) => metadataByArticle.get(itemKey(item)) || item)
    await writeJsonAtomic(CATALOG_PATH, catalog)
    await writeJsonAtomic(METADATA_PATH, metadata)
  }

  console.log(`Klaar: ${attempted} gecontroleerd, ${matched} exacte matches, ${cacheHits} uit cache, modus=${options.apply ? 'toegepast' : 'dry-run'}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runManufacturerEnrichment().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
