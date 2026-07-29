/**
 * Low-impact Groep Alelek webshop crawler.
 *
 * The public search result pages lazy-load while scrolling. This crawler uses
 * one browser tab, scrolls until the footer is visible, visits each product and
 * returns to the list. Progress is checkpointed after every product so a later
 * run can resume without opening the same detail page again.
 */

import puppeteer, { Browser, HTTPResponse, Page } from 'puppeteer'
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
  | { stage: 'category'; category: string; index: number; total: number }
  | { stage: 'discovered'; category: string; found: number; pending: number; footerReached: boolean }
  | { stage: 'product'; category: string; name: string; completed: number; maximum: number; cached: number }
  | { stage: 'rest'; seconds: number; completed: number }
  | { stage: 'complete'; cached: number; completedCategories: number; totalCategories: number }

type ScraperState = {
  version: 1
  date: string
  requests: number
  blockedAt?: string
  blockedStatus?: number
  blockedReason?: string
  completedCategories: string[]
  categoryScrollTargets: Record<string, number>
  products: Record<string, ScrapedProduct>
}

const STATE_PATH = resolve('.database', 'alelek-scraper-state.json')
const DEFAULT_MAX_PRODUCTS_PER_RUN = 75

export const ALELEK_CATEGORIES = [
  'Installatie',
  'Multimedia',
  'Industrie',
  'Verwarming en airco',
  'KNX',
  'Verlichting',
  'Domotica',
  'Toegang en beveiliging',
  'Huishoud',
  'Hernieuwbare energie',
  'Gereedschap',
  'Kabel',
  'Audio en video',
  'Batterij en toebehoren',
  'Ventilatie en centraal stofzuigersysteem',
  'Sanitair'
] as const

const today = (): string => new Date().toISOString().slice(0, 10)
const sleep = (duration: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, duration))
const randomBetween = (minimum: number, maximum: number): number =>
  Math.floor(minimum + Math.random() * (Math.max(minimum, maximum) - minimum + 1))

const readState = async (): Promise<ScraperState> => {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, 'utf8')) as Partial<ScraperState>
    return {
      version: 1,
      date: parsed.date || today(),
      requests: Number(parsed.requests) || 0,
      blockedAt: parsed.blockedAt,
      blockedStatus: parsed.blockedStatus,
      blockedReason: parsed.blockedReason,
      completedCategories: Array.isArray(parsed.completedCategories) ? parsed.completedCategories : [],
      categoryScrollTargets:
        parsed.categoryScrollTargets && typeof parsed.categoryScrollTargets === 'object'
          ? parsed.categoryScrollTargets
          : {},
      products: parsed.products && typeof parsed.products === 'object' ? parsed.products : {}
    }
  } catch {
    return { version: 1, date: today(), requests: 0, completedCategories: [], categoryScrollTargets: {}, products: {} }
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

const stopForBlock = async (state: ScraperState, reason: string, status?: number): Promise<never> => {
  state.blockedAt = new Date().toISOString()
  state.blockedReason = reason
  if (status) state.blockedStatus = status
  await writeState(state)
  throw new Error(`Alelek-blokkade gedetecteerd (${reason}); scraper onmiddellijk gestopt en checkpoint bewaard.`)
}

const checkResponse = async (
  response: HTTPResponse | null,
  state: ScraperState,
  dailyLimit?: number
): Promise<void> => {
  state.requests += 1
  const status = response?.status() || 0
  if (status === 403 || status === 429 || status === 503) await stopForBlock(state, `HTTP ${status}`, status)
  if (dailyLimitReached(state, dailyLimit)) {
    await writeState(state)
    throw new Error(`Alelek daglimiet (${dailyLimit} navigaties) bereikt; voer morgen opnieuw uit om te hervatten.`)
  }
}

const checkVisibleBlockPage = async (page: Page, state: ScraperState): Promise<void> => {
  const reason = await page.evaluate(() => {
    const title = document.title.toLowerCase()
    const body = (document.body?.innerText || '').slice(0, 5000).toLowerCase()
    const hasVisibleChallenge = Boolean(
      document.querySelector(
        'iframe[src*="captcha" i], iframe[src*="challenge" i], input[name*="captcha" i], [class*="captcha" i]'
      )
    )
    if (hasVisibleChallenge) return 'captcha of browser challenge'
    if (/access denied|toegang geweigerd|too many requests|temporarily blocked/.test(`${title}\n${body}`)) {
      return 'access-denied pagina'
    }
    return ''
  })
  if (reason) await stopForBlock(state, reason)
}

const navigate = async (
  page: Page,
  url: string,
  state: ScraperState,
  dailyLimit: number | undefined,
  timeout: number
): Promise<void> => {
  if (state.blockedAt) {
    throw new Error(`Alelek circuit breaker staat open sinds ${state.blockedAt}: ${state.blockedReason || 'blokkade'}.`)
  }
  if (dailyLimitReached(state, dailyLimit)) throw new Error(`Alelek daglimiet (${dailyLimit} navigaties) is bereikt.`)
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout })
  await checkResponse(response, state, dailyLimit)
  await checkVisibleBlockPage(page, state)
}

const authenticate = async (
  page: Page,
  username: string,
  password: string,
  state: ScraperState,
  dailyLimit: number | undefined,
  timeout: number
): Promise<void> => {
  await navigate(page, 'https://webshop.groepalelek.be/nl/login', state, dailyLimit, timeout)
  await acceptCookies(page)

  const emailSelector = 'input[placeholder="Jouw e-mailadres"], input[type="email"]'
  const passwordSelector = 'input[placeholder="********"], input[type="password"]'
  const visibleHandle = async (selector: string) => {
    const candidates = await page.$$(selector)
    for (const candidate of candidates) {
      const visible = await candidate.evaluate((element) => {
        const rectangle = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rectangle.width > 0 && rectangle.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      if (visible) return candidate
    }
    return null
  }
  const emailInput = await visibleHandle(emailSelector)
  const passwordInput = await visibleHandle(passwordSelector)
  if (!emailInput || !passwordInput) {
    throw new Error('Alelek loginformulier niet gevonden; scraper gestopt zonder productverzoeken.')
  }

  await emailInput.click()
  await emailInput.type(username, { delay: randomBetween(55, 110) })
  await passwordInput.click()
  await passwordInput.type(password, { delay: randomBetween(55, 110) })
  const buttons = await page.$$('button')
  let submit = await page.$('button[data-keepit-login-button]')
  for (const button of buttons) {
    const label = await button.evaluate((element) =>
      (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    )
    const visible = await button.evaluate((element) => {
      const rectangle = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rectangle.width > 0 && rectangle.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    })
    if (label === 'aanmelden' && visible) {
      submit = button
      break
    }
  }
  if (!submit) throw new Error('Alelek aanmeldknop niet gevonden.')

  await Promise.all([
    submit.click(),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => null)
  ])
  for (let attempt = 0; attempt < 12 && page.url().includes('/login'); attempt += 1) {
    await sleep(500)
  }
  if (page.url().includes('/login')) {
    throw new Error('Alelek-aanmelding mislukt; controleer de ingestelde accountgegevens of gebruik een bestaande sessie.')
  }
}

const acceptCookies = async (page: Page): Promise<void> => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const clicked = await page.evaluate(() => {
      const direct = document.querySelector('#cookiescript_accept, [data-cookiescript="accept"]')
      const labelElement = Array.from(document.querySelectorAll('button, [role="button"], span, div')).find((element) => {
        const label = (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        return label === 'alles accepteren'
      })
      const target = (direct || labelElement?.closest('button, [role="button"]') || labelElement) as HTMLElement | null
      target?.click()
      return Boolean(target)
    })
    if (clicked) {
      await sleep(randomBetween(700, 1400))
      return
    }
    await sleep(650)
  }
}

const scrollUntilFooter = async (
  page: Page,
  options: Required<Pick<AlelekScraperOptions, 'minScrollDelayMs' | 'maxScrollDelayMs'>>,
  targetSteps: number
): Promise<boolean> => {
  let stableRounds = 0
  let previousCount = -1

  for (let step = 0; step < targetSteps; step += 1) {
    const status = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]')).filter((link) =>
        /\/nl\/product\//i.test((link as HTMLAnchorElement).pathname)
      )
      const footer = document.querySelector('footer')
      const footerVisible = Boolean(footer && footer.getBoundingClientRect().top <= window.innerHeight)
      return { count: new Set(links.map((link) => (link as HTMLAnchorElement).href)).size, footerVisible }
    })

    stableRounds = status.count === previousCount ? stableRounds + 1 : 0
    previousCount = status.count
    if (status.footerVisible && stableRounds >= 2) return true

    await page.evaluate(() => window.scrollBy({ top: Math.floor(360 + Math.random() * 360), behavior: 'smooth' }))
    await sleep(randomBetween(options.minScrollDelayMs, options.maxScrollDelayMs))
  }
  return false
}

const collectProductUrls = async (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(
      new Set(
        Array.from(document.querySelectorAll('a[href]'))
          .map((link) => (link as HTMLAnchorElement).href)
          .filter((href) => /\/nl\/product\//i.test(new URL(href).pathname))
      )
    )
  )

const parsePrice = (priceText?: string): number | undefined => {
  if (!priceText) return undefined
  const match = priceText.match(/(?:€\s*)?([\d.]+(?:,\d{2})?)/)
  if (!match) return undefined
  const parsed = Number(match[1].replaceAll('.', '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

const readProduct = async (page: Page, url: string, category: string): Promise<ScrapedProduct | null> => {
  const raw = await page.evaluate(() => {
    const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() || ''
    const meta = (property: string) =>
      document.querySelector(`meta[property="${property}"]`)?.getAttribute('content') || ''
    const paragraphs = Array.from(document.querySelectorAll('main p'))
      .map((paragraph) => paragraph.textContent?.trim() || '')
      .filter(Boolean)
    const paragraph = (label: string) => paragraphs.find((value) => value.toLowerCase().startsWith(label.toLowerCase())) || ''
    const skuMatch = paragraph('Artikelcode:').match(/Artikelcode\s*:\s*([A-Z0-9._,/-]+)/i)
    const supplierSkuMatch = paragraph('Artikelcode leverancier:').match(/:\s*(.+)$/)
    const priceMatch = paragraph('Netto:').match(/Netto\s*:\s*€?\s*([\d.,]+)\s*\/\s*(.+)$/i)
    const eanMatch = paragraph('EAN:').match(/EAN\s*:\s*(\d{8,14})/i)
    const packagingMatch = paragraph('Standaardverpakking:').match(/Standaardverpakking\s*:\s*(\d+)\s*(.*)$/i)
    return {
      name: text('h1') || meta('og:title'),
      description: text('[class*="description"], [data-testid*="description"]') ||
        document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      price: priceMatch?.[1] || text('[class*="price"], [data-testid*="price"]'),
      unit: priceMatch?.[2]?.trim() || '',
      sku: skuMatch?.[1] || '',
      supplierSku: supplierSkuMatch?.[1]?.trim() || '',
      ean: eanMatch?.[1] || '',
      packagingQuantity: packagingMatch ? Number(packagingMatch[1]) : undefined,
      packagingUnit: packagingMatch?.[2]?.trim() || '',
      brand: paragraphs[0] === '|' ? paragraphs[1] || '' : paragraphs[0] || '',
      image: meta('og:image') ||
        (document.querySelector('main img[src]') as HTMLImageElement | null)?.src || ''
    }
  })
  if (!raw.name) return null
  return {
    name: raw.name,
    url,
    category,
    sku: raw.sku || undefined,
    price: parsePrice(raw.price),
    unit: raw.unit || undefined,
    packagingQuantity: raw.packagingQuantity,
    image: raw.image || undefined,
    description: raw.description || undefined,
    technicalData: {
      Categorie: category,
      ...(raw.brand ? { Merk: raw.brand } : {}),
      ...(raw.supplierSku ? { 'Artikelcode leverancier': raw.supplierSku } : {}),
      ...(raw.ean ? { EAN: raw.ean } : {}),
      ...(raw.packagingUnit ? { Verpakkingseenheid: raw.packagingUnit } : {})
    }
  }
}

const categoryFromUrl = (url: string): string => new URL(url).searchParams.get('category') || url

export async function scrapeAlekCategories(
  categoryUrls: string[] = [],
  options: AlelekScraperOptions = {}
): Promise<ScrapedProduct[]> {
  const settings = {
    headless: options.headless ?? true,
    timeout: options.timeout ?? 45000,
    dailyLimit: options.dailyLimit && options.dailyLimit > 0 ? Math.max(10, Math.floor(options.dailyLimit)) : undefined,
    maxProductsPerRun: Math.max(1, options.maxProductsPerRun ?? DEFAULT_MAX_PRODUCTS_PER_RUN),
    minProductDelayMs: Math.max(4000, options.minProductDelayMs ?? 5500),
    maxProductDelayMs: Math.max(6000, options.maxProductDelayMs ?? 10000),
    minScrollDelayMs: Math.max(1200, options.minScrollDelayMs ?? 1800),
    maxScrollDelayMs: Math.max(2200, options.maxScrollDelayMs ?? 4500),
    scrollStepsPerRun: Math.max(3, options.scrollStepsPerRun ?? 12)
  }
  if (settings.maxProductDelayMs < settings.minProductDelayMs) settings.maxProductDelayMs = settings.minProductDelayMs
  if (settings.maxScrollDelayMs < settings.minScrollDelayMs) settings.maxScrollDelayMs = settings.minScrollDelayMs

  const state = await readState()
  resetDailyCounter(state)
  if (options.refresh) {
    state.completedCategories = []
    state.categoryScrollTargets = {}
    state.products = {}
  }
  await writeState(state)

  const urls = categoryUrls.length
    ? categoryUrls
    : ALELEK_CATEGORIES.map((category) =>
        `https://webshop.groepalelek.be/nl/zoekresultaten?${new URLSearchParams({ category })}`
      )

  let browser: Browser | null = null
  try {
    browser = await puppeteer.launch({
      headless: settings.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: settings.timeout
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(settings.timeout)
    page.setDefaultNavigationTimeout(settings.timeout)

    if (options.username && options.password) {
      await authenticate(page, options.username, options.password, state, settings.dailyLimit, settings.timeout)
    }

    let visitedThisRun = 0
    let nextRestAfter = randomBetween(12, 18)
    for (const [categoryIndex, categoryUrl] of urls.entries()) {
      if (dailyLimitReached(state, settings.dailyLimit && settings.dailyLimit - 3)) return Object.values(state.products)
      const category = categoryFromUrl(categoryUrl)
      if (!options.refresh && state.completedCategories.includes(category)) continue

      options.onProgress?.({ stage: 'category', category, index: categoryIndex + 1, total: urls.length })
      await navigate(page, categoryUrl, state, settings.dailyLimit, settings.timeout)
      await acceptCookies(page)
      if (page.url().includes('/login')) throw new Error('Alelek vereist aanmelding voor productresultaten.')
      await page.waitForSelector('a[href*="/nl/product/"]', { timeout: settings.timeout })
      const previousTarget = Number(state.categoryScrollTargets[category] || 0)
      const targetSteps = Math.min(240, previousTarget + settings.scrollStepsPerRun)
      const footerReached = await scrollUntilFooter(page, settings, targetSteps)
      state.categoryScrollTargets[category] = targetSteps
      await writeState(state)
      const productUrls = await collectProductUrls(page)
      if (productUrls.length === 0) {
        throw new Error(`Geen productlinks gevonden voor categorie ${category}; categorie niet als voltooid gemarkeerd.`)
      }
      options.onProgress?.({
        stage: 'discovered',
        category,
        found: productUrls.length,
        pending: productUrls.filter((productUrl) => options.refresh || !state.products[productUrl]).length,
        footerReached
      })

      for (const productUrl of productUrls) {
        if (!options.refresh && state.products[productUrl]) continue
        if (
          visitedThisRun >= settings.maxProductsPerRun ||
          dailyLimitReached(state, settings.dailyLimit && settings.dailyLimit - 2)
        ) {
          await writeState(state)
          return Object.values(state.products)
        }

        await sleep(randomBetween(settings.minProductDelayMs, settings.maxProductDelayMs))
        await navigate(page, productUrl, state, settings.dailyLimit, settings.timeout)
        const product = await readProduct(page, productUrl, category)
        if (product) state.products[productUrl] = product
        visitedThisRun += 1
        await writeState(state)
        options.onProgress?.({
          stage: 'product',
          category,
          name: product?.name || productUrl,
          completed: visitedThisRun,
          maximum: settings.maxProductsPerRun,
          cached: Object.keys(state.products).length
        })

        const response = await page.goBack({ waitUntil: 'networkidle2', timeout: settings.timeout })
        await checkResponse(response, state, settings.dailyLimit)
        await checkVisibleBlockPage(page, state)

        if (visitedThisRun >= nextRestAfter && visitedThisRun < settings.maxProductsPerRun) {
          const restDuration = randomBetween(25000, 50000)
          options.onProgress?.({ stage: 'rest', seconds: Math.ceil(restDuration / 1000), completed: visitedThisRun })
          await sleep(restDuration)
          nextRestAfter += randomBetween(12, 18)
        }
      }

      if (footerReached && !state.completedCategories.includes(category)) state.completedCategories.push(category)
      await writeState(state)
    }

    options.onProgress?.({
      stage: 'complete',
      cached: Object.keys(state.products).length,
      completedCategories: state.completedCategories.length,
      totalCategories: urls.length
    })
    return Object.values(state.products)
  } finally {
    await browser?.close()
  }
}

export async function scrapeAlekProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  const products = await scrapeAlekCategories([productUrl], { maxProductsPerRun: 1 })
  return products.find((product) => product.url === productUrl) || null
}
