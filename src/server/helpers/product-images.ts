import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'
import { resolve, sep } from 'path'
import sharp from 'sharp'
import { readDescoCatalog } from './desco.js'
import { readAlelekCatalog } from './alelek.js'

export type ProductImageVariant = 'card' | 'detail'
export type ProductImageSource = 'all' | 'desco' | 'alelek'

const PRODUCT_IMAGE_VARIANTS: ProductImageVariant[] = ['card', 'detail']
const productImageRoot = resolve('.database/product-images')
const publicRoot = resolve('www')
const productImageRequests = new Map<string, Promise<void>>()
const productImageFailures = new Map<string, { expiresAt: number; error: Error }>()
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

const readCached = async (imageUrl: string, variant: ProductImageVariant): Promise<Buffer | undefined> => {
  try {
    return await readFile(cachePathFor(imageUrl, variant))
  } catch {
    return undefined
  }
}

export const getCatalogImageUrls = async (source: ProductImageSource = 'all'): Promise<Set<string>> => {
  if (source === 'all' && catalogImageUrls && catalogImageUrls.expiresAt > Date.now()) {
    return catalogImageUrls.urls
  }

  const [descoCatalog, alelekCatalog] = await Promise.all([
    source === 'alelek' ? undefined : readDescoCatalog(),
    source === 'desco' ? undefined : readAlelekCatalog()
  ])
  const urls = new Set(
    [...(descoCatalog?.items || []), ...(alelekCatalog?.items || [])]
      .map((item) => item.image)
      .filter((image): image is string => typeof image === 'string' && image.length > 0)
  )
  if (source === 'all') catalogImageUrls = { urls, expiresAt: Date.now() + 5 * 60_000 }
  return urls
}

const maxOriginalSize = 12 * 1024 * 1024

const fetchRemoteOriginal = (imageUrl: string, redirects = 0): Promise<Buffer> =>
  new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(imageUrl)
    const request = (url.protocol === 'https:' ? httpsGet : httpGet)(url, { timeout: 20_000 }, (response) => {
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
    })
    request.on('timeout', () => request.destroy(new Error('Afbeeldingsrequest timeout')))
    request.on('error', rejectPromise)
  })

const fetchOriginal = async (imageUrl: string): Promise<Buffer> => {
  if (/^https?:\/\//i.test(imageUrl)) return fetchRemoteOriginal(imageUrl)
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(imageUrl)) return fetchRemoteOriginal(`https://${imageUrl}`)
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
    const converted = await sharp(original, { limitInputPixels: 40_000_000 })
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
  total: number
  completed: number
  failed: Array<{ url: string; error: string }>
}

export const cacheCatalogImages = async (
  source: ProductImageSource = 'all',
  concurrency = 2,
  onProgress?: (report: ProductImageCacheReport) => void
): Promise<ProductImageCacheReport> => {
  const urls = [...(await getCatalogImageUrls(source))]
  const report: ProductImageCacheReport = { total: urls.length, completed: 0, failed: [] }
  const workerCount = Math.max(1, Math.min(6, Math.floor(concurrency) || 2))
  let cursor = 0

  const worker = async () => {
    while (cursor < urls.length) {
      const imageUrl = urls[cursor++]
      try {
        await cacheProductImage(imageUrl)
      } catch (error) {
        report.failed.push({
          url: imageUrl,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      report.completed += 1
      onProgress?.(report)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return report
}
