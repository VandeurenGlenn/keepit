#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const databaseDirectory = resolve('.database')
const catalogPath = resolve(databaseDirectory, 'alelek-materials.json')
const overridesPath = resolve(databaseDirectory, 'alelek-manufacturer-overrides.json')
const imageCachePath = resolve(databaseDirectory, 'product-images')
const reportPath = resolve(databaseDirectory, 'exports', 'siemens-mall-audit.json')
const mallProductUrl = 'https://mall.industry.siemens.com/mall/en/oeii/Catalog/Product'

const normalize = (value = '') => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase()
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const cacheFile = (imageUrl, variant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`

const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}

const writeJsonAtomic = async (path, value) => {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

const parseArguments = () => ({
  apply: process.argv.includes('--apply'),
  all: process.argv.includes('--all'),
  limit: Math.max(0, Number(process.argv.find((value) => value.startsWith('--limit='))?.split('=')[1] || 0))
})

export const parseSiemensMallPage = (html, mpn) => {
  const exactProduct = normalize(html).includes(normalize(mpn))
  const lifecycle = html.match(/PM\d{3}\s*:[^<\r\n]{1,160}/i)?.[0]?.replace(/\s+/g, ' ').trim() || ''
  const imageMatches = [...html.matchAll(/https:\/\/mall\.industry\.siemens\.com\/mall\/collaterals\/files\/[^"'<>\s]+\.(?:jpe?g|png)/gi)]
    .map((match) => match[0].replaceAll('&amp;', '&'))
  const image = imageMatches.find((url) => /\/[GPS]_[^/]+[ijp]\.(?:jpe?g|png)$/i.test(url)) || imageMatches[0] || ''
  return { exactProduct, lifecycle, image }
}

const fetchMallProduct = async (mpn) => {
  const url = new URL(mallProductUrl)
  url.searchParams.set('SiepCountryCode', 'OE')
  url.searchParams.set('mlfb', mpn)
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
          'User-Agent': 'KeepitCatalogAudit/1.0 (+official Siemens product verification)'
        },
        signal: AbortSignal.timeout(30_000)
      })
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!response.ok) return { mpn, pageUrl: url.href, status: response.status, exactProduct: false, lifecycle: '', image: '' }
      return { mpn, pageUrl: url.href, status: response.status, ...parseSiemensMallPage(await response.text(), mpn) }
    } catch (error) {
      lastError = error
      if (attempt < 4) await sleep(1_000 * (2 ** (attempt - 1)))
    }
  }
  return { mpn, pageUrl: url.href, status: 0, exactProduct: false, lifecycle: '', image: '', error: String(lastError?.message || lastError) }
}

const runPool = async (records, worker, concurrency = 2) => {
  let cursor = 0
  let completed = 0
  const results = new Array(records.length)
  const runners = Array.from({ length: Math.min(concurrency, records.length) }, async (_, runner) => {
    while (cursor < records.length) {
      const index = cursor
      cursor += 1
      if (index >= concurrency) await sleep(350 + runner * 100)
      results[index] = await worker(records[index])
      completed += 1
      if (completed % 10 === 0 || completed === records.length) {
        console.log(`  ${completed}/${records.length} Siemens-productpagina's gecontroleerd`)
      }
    }
  })
  await Promise.all(runners)
  return results
}

export const runSiemensMallAudit = async () => {
  const options = parseArguments()
  const catalog = await readJson(catalogPath, { items: [] })
  const overrides = await readJson(overridesPath, { version: 1, updatedAt: '', items: {} })
  const cachedFiles = new Set(await readdir(imageCachePath).catch(() => []))
  const products = new Map()

  for (const [index, item] of (catalog.items || []).entries()) {
    const brand = String(item.technicalData?.Merk || item.manufacturerData?.Merk || '').trim()
    if (!/^siemens$/i.test(brand)) continue
    const mpn = String(item.technicalData?.['Artikelcode leverancier'] || item.manufacturerData?.MPN || item.productNumber || '').trim()
    if (!mpn) continue
    const complete = Boolean(item.image) && ['card', 'detail'].every((variant) => cachedFiles.has(cacheFile(item.image, variant)))
    if (!options.all && complete) continue
    const key = mpn.toUpperCase()
    const product = products.get(key) || { mpn, indices: [] }
    product.indices.push(index)
    products.set(key, product)
  }

  let targets = [...products.values()].sort((left, right) => left.mpn.localeCompare(right.mpn))
  if (options.limit) targets = targets.slice(0, options.limit)
  console.log(`Siemens Mall-audit: ${targets.length} unieke ${options.all ? 'producten' : 'onvolledige producten'}, 2 gelijktijdige controles.`)
  const results = await runPool(targets, (target) => fetchMallProduct(target.mpn))
  const generatedAt = new Date().toISOString()
  const report = {
    generatedAt,
    requested: results.length,
    exactProducts: results.filter((result) => result.exactProduct).length,
    withLifecycle: results.filter((result) => result.lifecycle).length,
    withOfficialImage: results.filter((result) => result.exactProduct && result.image).length,
    active: results.filter((result) => /PM300\s*:/i.test(result.lifecycle)).length,
    phasedOutOrDiscontinued: results.filter((result) => /PM(?:4\d\d|500)\s*:/i.test(result.lifecycle)).length,
    unresolved: results.filter((result) => !result.exactProduct).length,
    products: results
  }
  await writeJsonAtomic(reportPath, report)

  if (options.apply) {
    let appliedImages = 0
    let appliedLifecycle = 0
    for (const result of results) {
      if (!result.exactProduct) continue
      const target = products.get(result.mpn.toUpperCase())
      for (const index of target?.indices || []) {
        const item = catalog.items[index]
        if (result.image && item.image !== result.image) {
          item.image = result.image
          appliedImages += 1
        }
        if (result.lifecycle) {
          item.manufacturerData = { ...(item.manufacturerData || {}), ProductLifecycle: result.lifecycle }
          appliedLifecycle += 1
        }
        item.enrichedAt = generatedAt
        item.dataSources = [...new Map([...(item.dataSources || []), {
          provider: 'Siemens Industry Mall',
          pageUrl: result.pageUrl,
          productNumber: result.mpn,
          fetchedAt: generatedAt
        }].map((source) => [`${source.provider}|${source.pageUrl}`, source])).values()]
        const key = String(item.articleNumber || item.productNumber || '')
        overrides.items[key] = {
          ...(overrides.items[key] || {}),
          image: item.image,
          manufacturerData: item.manufacturerData,
          dataSources: item.dataSources,
          imageCandidates: item.imageCandidates,
          enrichedAt: item.enrichedAt
        }
      }
    }
    catalog.updatedAt = generatedAt
    overrides.updatedAt = generatedAt
    await writeJsonAtomic(catalogPath, catalog)
    await writeJsonAtomic(overridesPath, overrides)
    console.log(`✓ ${appliedImages} catalogusregels kregen een officieel Mall-beeld; ${appliedLifecycle} kregen lifecycle-data.`)
  } else {
    console.log('Dry-run: voeg --apply toe om exacte beelden en lifecycle-data toe te passen.')
  }
  console.log(`Rapport: ${reportPath}`)
  return report
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runSiemensMallAudit().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
