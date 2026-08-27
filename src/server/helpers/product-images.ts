import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'fs/promises'
import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'
import { resolve, sep } from 'path'
import sharp from 'sharp'
import { readDescoCatalog } from './desco.js'
import { readAlelekCatalog } from './alelek.js'
import { repairProductImageUrl } from './image-url-repair.js'

export type ProductImageVariant = 'card' | 'detail'
export type ProductImageSource = 'all' | 'desco' | 'alelek'

const PRODUCT_IMAGE_VARIANTS: ProductImageVariant[] = ['card', 'detail']
const productImageRoot = resolve('.database/product-images')
const productImageStatePath = resolve('.database/product-image-cache-state.json')
const catalogAssetRoot = resolve('.database/catalog-assets')
const publicRoot = resolve('www')
const productImageRequests = new Map<string, Promise<void>>()
const productImageFailures = new Map<string, { expiresAt: number; error: Error }>()
const CURRENT_REPAIR_VERSION = 1
let conversionQueue: Promise<void> = Promise.resolve()
let catalogImageUrls: { expiresAt: number; urls: Set<string> } | undefined

const variantSettings: Record<ProductImageVariant, { width: number; height: number; quality: number; effort: number }> =
  {
    card: { width: 360, height: 260, quality: 78, effort: 4 },
    detail: { width: 1600, height: 1200, quality: 86, effort: 5 }
  }

const cachePathFor = (imageUrl: string, variant: ProductImageVariant) => {
  const cacheKey = createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')
  return resolve(productImageRoot, `${cacheKey}.webp`)
}

const cacheFileFor = (imageUrl: string, variant: ProductImageVariant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`

const readCached = async (imageUrl: string, variant: ProductImageVariant): Promise<Buffer | undefined> => {
  try {
    return await readFile(cachePathFor(imageUrl, variant))
  } catch {
    return undefined
  }
}

export const getCatalogImageUrls = async (
  source: ProductImageSource = 'all',
  provider?: string
): Promise<Set<string>> => {
  if (source === 'all' && !provider && catalogImageUrls && catalogImageUrls.expiresAt > Date.now()) {
    return catalogImageUrls.urls
  }

  const [descoCatalog, alelekCatalog] = await Promise.all([
    source === 'alelek' ? undefined : readDescoCatalog(),
    source === 'desco' ? undefined : readAlelekCatalog()
  ])
  const providerKey = provider?.toLowerCase()
  const items = [...(descoCatalog?.items || []), ...(alelekCatalog?.items || [])]
  const urls = new Set(
    items
      .filter(
        (item) =>
          !providerKey ||
          item.dataSources?.some((dataSource) => dataSource.provider.toLowerCase().includes(providerKey))
      )
      .map((item) => item.image)
      .filter((image): image is string => typeof image === 'string' && image.length > 0)
  )
  if (source === 'all' && !provider) catalogImageUrls = { urls, expiresAt: Date.now() + 5 * 60_000 }
  return urls
}

const maxOriginalSize = 12 * 1024 * 1024

const fetchRemoteOriginal = (imageUrl: string, redirects = 0): Promise<Buffer> =>
  new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(imageUrl)
    const request = (url.protocol === 'https:' ? httpsGet : httpGet)(
      url,
      {
        timeout: 20_000,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.7',
          Referer: `${url.protocol}//${url.host}/`,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139 Safari/537.36 KeepitImageCache/1.0'
        }
      },
      (response) => {
        const status = response.statusCode || 0
        if (status >= 300 && status < 400 && response.headers.location && redirects < 5) {
          response.resume()
          try {
            const redirectUrl = new URL(response.headers.location, url).href
            void fetchRemoteOriginal(redirectUrl, redirects + 1).then(resolvePromise, rejectPromise)
          } catch (error) {
            rejectPromise(error)
          }
          return
        }
        if (status < 200 || status >= 300) {
          response.resume()
          rejectPromise(new Error(`HTTP ${status}`))
          return
        }

        const contentType = String(response.headers['content-type'] || '').toLowerCase()
        if (/text\/html|application\/(?:json|xml)/i.test(contentType)) {
          response.resume()
          rejectPromise(new Error(`bron antwoordde ${contentType || 'geen afbeelding'}`))
          return
        }

        const declaredSize = Number(response.headers['content-length'])
        if (Number.isFinite(declaredSize) && declaredSize > maxOriginalSize) {
          response.destroy()
          rejectPromise(new Error('bronafbeelding is groter dan 12 MB'))
          return
        }

        const chunks: Buffer[] = []
        let received = 0
        response.on('data', (chunk: Buffer) => {
          received += chunk.byteLength
          if (received > maxOriginalSize) {
            response.destroy(new Error('bronafbeelding is groter dan 12 MB'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => resolvePromise(Buffer.concat(chunks)))
        response.on('error', rejectPromise)
      }
    )
    request.on('timeout', () => request.destroy(new Error('Afbeeldingsrequest timeout')))
    request.on('error', rejectPromise)
  })

const fetchOriginal = async (imageUrl: string): Promise<Buffer> => {
  const repairedUrl = repairProductImageUrl(imageUrl)
  if (/^https?:\/\//i.test(repairedUrl)) {
    const candidates = [repairedUrl]
    if (/^http:\/\//i.test(repairedUrl)) candidates.unshift(repairedUrl.replace(/^http:/i, 'https:'))
    let lastError: unknown
    for (const candidate of [...new Set(candidates)]) {
      try {
        return await fetchRemoteOriginal(candidate)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
  if (imageUrl.startsWith('/catalog-assets/')) {
    const relativePath = imageUrl.slice('/catalog-assets/'.length)
    const localPath = resolve(catalogAssetRoot, relativePath)
    if (!localPath.startsWith(`${catalogAssetRoot}${sep}`)) throw new Error('Ongeldig lokaal catalogusbeeldpad')
    const original = await readFile(localPath)
    if (original.byteLength > maxOriginalSize) throw new Error('bronafbeelding is groter dan 12 MB')
    return original
  }

  if (!imageUrl.startsWith('/cache/')) throw new Error('Niet-ondersteunde afbeeldingsbron')

  const localPath = resolve(publicRoot, `.${imageUrl}`)
  if (!localPath.startsWith(`${publicRoot}${sep}`)) throw new Error('Ongeldig lokaal afbeeldingspad')
  const original = await readFile(localPath)
  if (original.byteLength > maxOriginalSize) throw new Error('bronafbeelding is groter dan 12 MB')
  return original
}

const writeVariant = async (original: Buffer, imageUrl: string, variant: ProductImageVariant): Promise<void> => {
  let releaseConversion!: () => void
  const previousConversion = conversionQueue
  conversionQueue = new Promise<void>((resolvePromise) => {
    releaseConversion = resolvePromise
  })
  await previousConversion

  try {
    const settings = variantSettings[variant]
    const converted = await sharp(original, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: settings.width, height: settings.height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: settings.quality, effort: settings.effort })
      .toBuffer()
    const cachePath = cachePathFor(imageUrl, variant)
    const temporaryPath = `${cachePath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, converted)
    await rename(temporaryPath, cachePath)
  } finally {
    releaseConversion()
  }
}

const ensureProductImageVariants = async (imageUrl: string): Promise<void> => {
  await mkdir(productImageRoot, { recursive: true })
  const missing: ProductImageVariant[] = []
  for (const variant of PRODUCT_IMAGE_VARIANTS) {
    if (!(await readCached(imageUrl, variant))) missing.push(variant)
  }
  if (!missing.length) return

  const original = await fetchOriginal(imageUrl)
  for (const variant of missing) {
    await writeVariant(original, imageUrl, variant)
  }
}

export const cacheProductImage = async (imageUrl: string): Promise<void> => {
  const failed = productImageFailures.get(imageUrl)
  if (failed && failed.expiresAt > Date.now()) throw failed.error
  productImageFailures.delete(imageUrl)

  const existing = productImageRequests.get(imageUrl)
  if (existing) return existing

  const request = ensureProductImageVariants(imageUrl)
    .catch((error) => {
      const imageError = error instanceof Error ? error : new Error(String(error))
      productImageFailures.set(imageUrl, { expiresAt: Date.now() + 60 * 60_000, error: imageError })
      throw imageError
    })
    .finally(() => productImageRequests.delete(imageUrl))
  productImageRequests.set(imageUrl, request)
  return request
}

export const getProductImage = async (imageUrl: string, variant: ProductImageVariant): Promise<Buffer> => {
  const cached = await readCached(imageUrl, variant)
  if (cached) return cached
  await cacheProductImage(imageUrl)
  const generated = await readCached(imageUrl, variant)
  if (!generated) throw new Error(`Kon ${variant}-afbeelding niet genereren`)
  return generated
}

export type ProductImageCacheReport = {
  catalogTotal: number
  total: number
  completed: number
  alreadyCached: number
  deferred: number
  failed: Array<{ url: string; error: string }>
}

type PersistedImageFailure = {
  url: string
  attempts: number
  error: string
  lastAttemptAt: string
  retryAfter: string
  permanent: boolean
  repairVersion?: number
}

type ProductImageCacheState = {
  version: 1
  updatedAt: string
  failures: Record<string, PersistedImageFailure>
}

type ProductImageCacheOptions = {
  limit?: number
  retryFailures?: boolean
  repairFailures?: boolean
  provider?: string
}

const readImageCacheState = async (): Promise<ProductImageCacheState> => {
  try {
    const parsed = JSON.parse(await readFile(productImageStatePath, 'utf8')) as Partial<ProductImageCacheState>
    return {
      version: 1,
      updatedAt: String(parsed.updatedAt || ''),
      failures: parsed.failures && typeof parsed.failures === 'object' ? parsed.failures : {}
    }
  } catch {
    return { version: 1, updatedAt: '', failures: {} }
  }
}

const writeImageCacheState = async (state: ProductImageCacheState): Promise<void> => {
  state.updatedAt = new Date().toISOString()
  const temporaryPath = `${productImageStatePath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, productImageStatePath)
}

const imageUrlKey = (imageUrl: string) => createHash('sha256').update(imageUrl).digest('hex')

const permanentImageFailure = (message: string): boolean =>
  /HTTP 404|HTTP 410|niet-ondersteunde afbeeldingsbron|unsupported image format|corrupt header|XML parse error|groter dan 12 MB|bron antwoordde text\/html/i.test(
    message
  )

const repairableImageFailure = (failure: PersistedImageFailure): boolean =>
  repairProductImageUrl(failure.url) !== failure.url.trim() ||
  /HTTP 400|HTTP 401|HTTP 403|certificate|pixel limit/i.test(failure.error)

const interleaveByHost = (urls: string[]): string[] => {
  const byHost = new Map<string, string[]>()
  for (const url of urls) {
    let host = 'local'
    try {
      host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host || 'local'
    } catch {
      // Unsupported values are grouped and recorded as failures by the normal loader.
    }
    const group = byHost.get(host) || []
    group.push(url)
    byHost.set(host, group)
  }

  const result: string[] = []
  const groups = [...byHost.values()]
  let remaining = urls.length
  while (remaining > 0) {
    for (const group of groups) {
      const next = group.shift()
      if (!next) continue
      result.push(next)
      remaining -= 1
    }
  }
  return result
}

export const cacheCatalogImages = async (
  source: ProductImageSource = 'all',
  concurrency = 2,
  onProgress?: (report: ProductImageCacheReport) => void,
  options: ProductImageCacheOptions = {}
): Promise<ProductImageCacheReport> => {
  const urls = [...(await getCatalogImageUrls(source, options.provider))]
  await mkdir(productImageRoot, { recursive: true })
  const cachedFiles = new Set(await readdir(productImageRoot))
  const state = await readImageCacheState()
  const now = Date.now()
  const missing: string[] = []
  let alreadyCached = 0
  let deferred = 0

  for (const imageUrl of urls) {
    const complete = PRODUCT_IMAGE_VARIANTS.every((variant) => cachedFiles.has(cacheFileFor(imageUrl, variant)))
    if (complete) {
      alreadyCached += 1
      delete state.failures[imageUrlKey(imageUrl)]
      continue
    }
    const previousFailure = state.failures[imageUrlKey(imageUrl)]
    if (
      previousFailure &&
      options.repairFailures &&
      (!repairableImageFailure(previousFailure) || previousFailure.repairVersion === CURRENT_REPAIR_VERSION)
    ) {
      deferred += 1
      continue
    }
    if (
      previousFailure &&
      !options.retryFailures &&
      !options.repairFailures &&
      (previousFailure.permanent || Date.parse(previousFailure.retryAfter) > now)
    ) {
      deferred += 1
      continue
    }
    missing.push(imageUrl)
  }

  const ordered = interleaveByHost(missing)
  const selected = Number.isFinite(options.limit) ? ordered.slice(0, Math.max(0, Number(options.limit))) : ordered
  const report: ProductImageCacheReport = {
    catalogTotal: urls.length,
    total: selected.length,
    completed: 0,
    alreadyCached,
    deferred,
    failed: []
  }
  const workerCount = Math.max(1, Math.min(6, Math.floor(concurrency) || 2))
  let cursor = 0
  let stateWrite = Promise.resolve()

  const checkpoint = (): Promise<void> => {
    stateWrite = stateWrite.then(() => writeImageCacheState(state))
    return stateWrite
  }

  const worker = async () => {
    while (cursor < selected.length) {
      const imageUrl = selected[cursor++]
      try {
        await cacheProductImage(imageUrl)
        delete state.failures[imageUrlKey(imageUrl)]
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        report.failed.push({
          url: imageUrl,
          error: message
        })
        const key = imageUrlKey(imageUrl)
        const attempts = Number(state.failures[key]?.attempts || 0) + 1
        const permanent = permanentImageFailure(message)
        const retryDelay = permanent ? 365 * 24 * 60 * 60_000 : Math.min(7, 2 ** Math.min(attempts, 6)) * 60 * 60_000
        state.failures[key] = {
          url: imageUrl,
          attempts,
          error: message,
          lastAttemptAt: new Date().toISOString(),
          retryAfter: new Date(Date.now() + retryDelay).toISOString(),
          permanent,
          repairVersion: options.repairFailures ? CURRENT_REPAIR_VERSION : state.failures[key]?.repairVersion
        }
      }
      report.completed += 1
      onProgress?.(report)
      if (report.completed % 100 === 0) await checkpoint()
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  await checkpoint()
  return report
}
