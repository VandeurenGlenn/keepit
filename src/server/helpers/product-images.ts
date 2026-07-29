import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { resolve } from 'path'
import sharp from 'sharp'
import { readDescoCatalog } from './desco.js'
import { readAlelekCatalog } from './alelek.js'

export type ProductImageVariant = 'card' | 'detail'
export type ProductImageSource = 'all' | 'desco' | 'alelek'

const PRODUCT_IMAGE_VARIANTS: ProductImageVariant[] = ['card', 'detail']
const productImageRoot = resolve('.database/product-images')
const productImageRequests = new Map<string, Promise<void>>()
let conversionQueue: Promise<void> = Promise.resolve()
let catalogImageUrls: { expiresAt: number; urls: Set<string> } | undefined

const variantSettings: Record<
  ProductImageVariant,
  { width: number; height: number; quality: number; effort: number }
> = {
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
      .filter((image): image is string => typeof image === 'string' && /^https?:\/\//i.test(image))
  )
  if (source === 'all') catalogImageUrls = { urls, expiresAt: Date.now() + 5 * 60_000 }
  return urls
}

const fetchOriginal = async (imageUrl: string): Promise<Buffer> => {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > 12 * 1024 * 1024) {
    throw new Error('bronafbeelding is groter dan 12 MB')
  }

  const original = Buffer.from(await response.arrayBuffer())
  if (original.byteLength > 12 * 1024 * 1024) throw new Error('bronafbeelding is groter dan 12 MB')
  return original
}

const writeVariant = async (
  original: Buffer,
  imageUrl: string,
  variant: ProductImageVariant
): Promise<void> => {
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
  const existing = productImageRequests.get(imageUrl)
  if (existing) return existing

  const request = ensureProductImageVariants(imageUrl).finally(() => productImageRequests.delete(imageUrl))
  productImageRequests.set(imageUrl, request)
  return request
}

export const getProductImage = async (
  imageUrl: string,
  variant: ProductImageVariant
): Promise<Buffer> => {
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
