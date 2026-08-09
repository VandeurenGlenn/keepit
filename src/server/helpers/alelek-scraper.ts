import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { resolve } from 'path'

export interface ScrapedProduct {
  name: string
  sku?: string
  price?: number
  unit?: string
  packagingQuantity?: number
  url?: string
  image?: string
  description?: string
  category?: string
  technicalData?: Record<string, string>
}

export interface AlelekScraperOptions {
  headless?: boolean
  timeout?: number
  username?: string
  password?: string
  dailyLimit?: number
  maxProductsPerRun?: number
  minProductDelayMs?: number
  maxProductDelayMs?: number
  minScrollDelayMs?: number
  maxScrollDelayMs?: number
  scrollStepsPerRun?: number
  refresh?: boolean
  onProgress?: (progress: AlelekScraperProgress) => void
}

export type AlelekScraperProgress =
  | { stage: 'status'; message: string }
  | { stage: 'category'; category: string; index: number; total: number }
  | { stage: 'category-complete'; category: string; index: number; total: number; pages: number; products: number }
  | {
      stage: 'pause'
      category: string
      remainingSeconds: number
      page: number
      totalPages: number
      processed: number
      expected: number
    }
  | {
      stage: 'page'
      category: string
      page: number
      totalPages: number
      received: number
      processed: number
      cached: number
      expected: number
    }
  | { stage: 'complete'; cached: number; completedCategories: number; totalCategories: number; partial: boolean }

type ScraperState = {
  version: 2
  date: string
  requests: number
  blockedAt?: string
  blockedStatus?: number
  blockedReason?: string
  completedCategories: string[]
  categoryPages: Record<string, number>
  categoryTotals: Record<string, number>
  products: Record<string, ScrapedProduct>
}

type ApiCategory = {
  id: string
  name: string
}

type ApiArticle = {
  external_id?: string
  supplier_item_id?: string
  name: string
  slug: string
  image_url?: string
  price?: number
  ean_code?: string
  stock_unit?: string
  default_packaging?: number
  brand?: { name?: string }
  category?: { name?: string }
}

type ApiSearchPage = {
  data: ApiArticle[]
  pagination: {
    total: number
    current_page: number
    total_pages: number
  }
}

const API_ROOT = 'https://webshop.groepalelek.be/api'
const SHOP_ROOT = 'https://webshop.groepalelek.be/nl/product'
const STATE_PATH = resolve('.database', 'alelek-scraper-state.json')
const PAGE_SIZE = 250
const DEFAULT_MAX_PRODUCTS_PER_RUN = 25000
const REQUEST_RETRY_LIMIT = 3

const today = (): string => new Date().toISOString().slice(0, 10)
const sleep = (duration: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, duration))
const randomBetween = (minimum: number, maximum: number): number =>
  Math.floor(minimum + Math.random() * (Math.max(minimum, maximum) - minimum + 1))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const readState = async (): Promise<ScraperState> => {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, 'utf8')) as Record<string, unknown>
    const currentVersion = parsed.version === 2
    return {
      version: 2,
      date: typeof parsed.date === 'string' ? parsed.date : today(),
      requests: Number(parsed.requests) || 0,
      blockedAt: typeof parsed.blockedAt === 'string' ? parsed.blockedAt : undefined,
      blockedStatus: typeof parsed.blockedStatus === 'number' ? parsed.blockedStatus : undefined,
      blockedReason: typeof parsed.blockedReason === 'string' ? parsed.blockedReason : undefined,
      completedCategories:
        currentVersion && Array.isArray(parsed.completedCategories)
          ? parsed.completedCategories.filter((value): value is string => typeof value === 'string')
          : [],
      categoryPages:
        currentVersion && isRecord(parsed.categoryPages)
          ? Object.fromEntries(Object.entries(parsed.categoryPages).map(([key, value]) => [key, Number(value) || 1]))
          : {},
      categoryTotals:
        currentVersion && isRecord(parsed.categoryTotals)
          ? Object.fromEntries(Object.entries(parsed.categoryTotals).map(([key, value]) => [key, Number(value) || 0]))
          : {},
      products: isRecord(parsed.products) ? (parsed.products as Record<string, ScrapedProduct>) : {}
    }
  } catch {
    return {
      version: 2,
      date: today(),
      requests: 0,
      completedCategories: [],
      categoryPages: {},
      categoryTotals: {},
      products: {}
    }
  }
}

const writeState = async (state: ScraperState): Promise<void> => {
  await mkdir(resolve('.database'), { recursive: true })
  const temporaryPath = `${STATE_PATH}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, STATE_PATH)
}

const resetDailyCounter = (state: ScraperState): void => {
  if (state.date === today()) return
  state.date = today()
  state.requests = 0
  delete state.blockedAt
  delete state.blockedStatus
  delete state.blockedReason
}

const dailyLimitReached = (state: ScraperState, dailyLimit?: number): boolean =>
  Boolean(dailyLimit && dailyLimit > 0 && state.requests >= dailyLimit)

const fetchJson = async (
  url: string,
  label: string,
  state: ScraperState,
  timeout: number,
  dailyLimit?: number,
  onProgress?: (progress: AlelekScraperProgress) => void
): Promise<unknown> => {
  if (state.blockedAt) {
    throw new Error(`Alelek circuit breaker staat open sinds ${state.blockedAt}: ${state.blockedReason || 'blokkade'}.`)
  }
  if (dailyLimitReached(state, dailyLimit)) throw new Error(`Alelek daglimiet (${dailyLimit} requests) is bereikt.`)

  for (let attempt = 1; attempt <= REQUEST_RETRY_LIMIT; attempt += 1) {
    try {
      onProgress?.({ stage: 'status', message: `${label}: request ${attempt}/${REQUEST_RETRY_LIMIT} versturen…` })
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
      state.requests += 1
      if ([403, 429, 503].includes(response.status)) {
        state.blockedAt = new Date().toISOString()
        state.blockedStatus = response.status
        state.blockedReason = `HTTP ${response.status}`
        await writeState(state)
        throw new Error(`Alelek-blokkade gedetecteerd (HTTP ${response.status}); checkpoint bewaard.`)
      }
      if (!response.ok) throw new Error(`Alelek API gaf HTTP ${response.status} voor ${url}.`)
      return response.json() as Promise<unknown>
    } catch (error) {
      if (state.blockedAt || attempt === REQUEST_RETRY_LIMIT) throw error
      const retryDelay = 1000 * attempt + randomBetween(250, 700)
      const reason = error instanceof Error ? error.message : String(error)
      onProgress?.({
        stage: 'status',
        message: `${label}: mislukt (${reason}); opnieuw proberen over ${(retryDelay / 1000).toFixed(1)}s…`
      })
      await sleep(retryDelay)
    }
  }

  throw new Error(`Alelek API request mislukt voor ${url}.`)
}

const parseCategories = (payload: unknown): ApiCategory[] => {
  if (!Array.isArray(payload)) throw new Error('Alelek categorie-API gaf een ongeldig antwoord.')
  return payload.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return []
    return [{ id: value.id, name: value.name }]
  })
}

const parseSearchPage = (payload: unknown): ApiSearchPage => {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.pagination)) {
    throw new Error('Alelek artikel-API gaf een ongeldig antwoord.')
  }

  const data = payload.data.flatMap((value): ApiArticle[] => {
    if (!isRecord(value) || typeof value.name !== 'string' || typeof value.slug !== 'string') return []
    return [value as ApiArticle]
  })
  const total = Number(payload.pagination.total)
  const currentPage = Number(payload.pagination.current_page)
  const totalPages = Number(payload.pagination.total_pages)
  if (![total, currentPage, totalPages].every(Number.isFinite)) {
    throw new Error('Alelek artikel-API gaf ongeldige paginatie terug.')
  }

  return { data, pagination: { total, current_page: currentPage, total_pages: totalPages } }
}

const requestedCategoryNames = (categoryUrls: string[], categories: ApiCategory[]): string[] => {
  if (categoryUrls.length === 0) return categories.map(({ name }) => name)
  return categoryUrls.map((categoryUrl) => {
    try {
      return new URL(categoryUrl).searchParams.get('category') || categoryUrl
    } catch {
      return categoryUrl
    }
  })
}

const articleToProduct = (article: ApiArticle, topCategory: string): ScrapedProduct => ({
  name: article.name,
  sku: article.external_id,
  price: typeof article.price === 'number' ? article.price : undefined,
  unit: article.stock_unit,
  packagingQuantity: article.default_packaging,
  url: `${SHOP_ROOT}/${article.slug}`,
  image: article.image_url,
  category: topCategory,
  technicalData: {
    Hoofdcategorie: topCategory,
    ...(article.category?.name ? { Categorie: article.category.name } : {}),
    ...(article.brand?.name ? { Merk: article.brand.name } : {}),
    ...(article.supplier_item_id ? { 'Artikelcode leverancier': article.supplier_item_id } : {}),
    ...(article.ean_code ? { EAN: article.ean_code } : {})
  }
})

export async function scrapeAlekCategories(
  categoryUrls: string[] = [],
  options: AlelekScraperOptions = {}
): Promise<ScrapedProduct[]> {
  const settings = {
    timeout: options.timeout ?? 45000,
    dailyLimit: options.dailyLimit && options.dailyLimit > 0 ? Math.max(10, Math.floor(options.dailyLimit)) : undefined,
    productsPerBatch: Math.max(PAGE_SIZE, options.maxProductsPerRun ?? DEFAULT_MAX_PRODUCTS_PER_RUN),
    minRequestDelayMs: Math.max(500, options.minScrollDelayMs ?? 1200),
    maxRequestDelayMs: Math.max(1000, options.maxScrollDelayMs ?? 2200)
  }
  if (settings.maxRequestDelayMs < settings.minRequestDelayMs) settings.maxRequestDelayMs = settings.minRequestDelayMs

  const state = await readState()
  resetDailyCounter(state)
  if (options.refresh) {
    state.completedCategories = []
    state.categoryPages = {}
    state.categoryTotals = {}
    state.products = {}
  }

  const categories = parseCategories(
    await fetchJson(
      `${API_ROOT}/categories`,
      'Categorie-overzicht',
      state,
      settings.timeout,
      settings.dailyLimit,
      options.onProgress
    )
  )
  options.onProgress?.({ stage: 'status', message: `${categories.length} hoofdcategorieën ontvangen.` })
  const names = requestedCategoryNames(categoryUrls, categories)
  const selectedCategories = names.map((name) => {
    const category = categories.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())
    if (!category) throw new Error(`Onbekende Alelek-categorie: ${name}.`)
    return category
  })

  let fetchedSinceRest = 0
  for (const [categoryIndex, category] of selectedCategories.entries()) {
    if (state.completedCategories.includes(category.name)) continue
    options.onProgress?.({
      stage: 'category',
      category: category.name,
      index: categoryIndex + 1,
      total: selectedCategories.length
    })

    let page = state.categoryPages[category.name] || 1
    while (!dailyLimitReached(state, settings.dailyLimit)) {
      if (fetchedSinceRest > 0) {
        const requestDelay = randomBetween(settings.minRequestDelayMs, settings.maxRequestDelayMs)
        options.onProgress?.({
          stage: 'status',
          message: `${category.name}: ${(requestDelay / 1000).toFixed(1)}s wachten voor pagina ${page}…`
        })
        await sleep(requestDelay)
      }
      const query = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        already_bought: '0',
        category_id: category.id
      })
      const result = parseSearchPage(
        await fetchJson(
          `${API_ROOT}/articles/search?${query}`,
          `${category.name} pagina ${page}`,
          state,
          settings.timeout,
          settings.dailyLimit,
          options.onProgress
        )
      )
      state.categoryTotals[category.name] = result.pagination.total

      for (const article of result.data) {
        const product = articleToProduct(article, category.name)
        if (product.url) state.products[product.url] = product
      }

      fetchedSinceRest += result.data.length
      page += 1
      state.categoryPages[category.name] = page
      const categoryComplete =
        result.data.length === 0 || result.pagination.current_page >= result.pagination.total_pages
      if (categoryComplete && !state.completedCategories.includes(category.name)) {
        state.completedCategories.push(category.name)
      }
      options.onProgress?.({
        stage: 'status',
        message: `${category.name} pagina ${result.pagination.current_page}: ${result.data.length} ontvangen; checkpoint opslaan…`
      })
      await writeState(state)
      options.onProgress?.({
        stage: 'page',
        category: category.name,
        page: result.pagination.current_page,
        totalPages: result.pagination.total_pages,
        received: result.data.length,
        processed: Math.min(
          (result.pagination.current_page - 1) * PAGE_SIZE + result.data.length,
          result.pagination.total
        ),
        cached: Object.keys(state.products).length,
        expected: result.pagination.total
      })

      if (categoryComplete || result.data.length === 0) {
        options.onProgress?.({
          stage: 'category-complete',
          category: category.name,
          index: categoryIndex + 1,
          total: selectedCategories.length,
          pages: result.pagination.total_pages,
          products: result.pagination.total
        })
        break
      }

      if (fetchedSinceRest >= settings.productsPerBatch) {
        const restDuration = randomBetween(20000, 180000)
        const processed = Math.min(
          (result.pagination.current_page - 1) * PAGE_SIZE + result.data.length,
          result.pagination.total
        )
        const pauseEndsAt = Date.now() + restDuration
        let remainingSeconds = Math.ceil(restDuration / 1000)
        while (remainingSeconds > 0) {
          options.onProgress?.({
            stage: 'pause',
            category: category.name,
            remainingSeconds,
            page: result.pagination.current_page,
            totalPages: result.pagination.total_pages,
            processed,
            expected: result.pagination.total
          })
          await sleep(Math.min(1000, Math.max(1, pauseEndsAt - Date.now())))
          remainingSeconds = Math.ceil(Math.max(0, pauseEndsAt - Date.now()) / 1000)
        }
        options.onProgress?.({
          stage: 'pause',
          category: category.name,
          remainingSeconds: 0,
          page: result.pagination.current_page,
          totalPages: result.pagination.total_pages,
          processed,
          expected: result.pagination.total
        })
        fetchedSinceRest = 0
      }
    }

    if (dailyLimitReached(state, settings.dailyLimit)) break
  }

  const completedCategories = selectedCategories.filter(({ name }) => state.completedCategories.includes(name)).length
  options.onProgress?.({
    stage: 'complete',
    cached: Object.keys(state.products).length,
    completedCategories,
    totalCategories: selectedCategories.length,
    partial: completedCategories < selectedCategories.length
  })
  return Object.values(state.products)
}
