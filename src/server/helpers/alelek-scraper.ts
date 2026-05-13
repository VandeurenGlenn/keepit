/**
 * Groep Alelek Webshop Scraper
 *
 * Scrapes product information (name, price, SKU) from the Groep Alelek webshop.
 *
 * Usage:
 *   const products = await scrapeAlekCategories([], { headless: true })
 *   // Returns: [{ name: "...", price: 12.50, sku: "...", url: "..." }, ...]
 *
 * The scraper handles:
 * - Dynamic JavaScript-rendered content (via Puppeteer)
 * - Pagination across multiple product pages
 * - Price parsing with European notation (€12,50 or €12.50)
 * - Multiple HTML selector patterns for flexibility
 */

import puppeteer, { Browser, Page } from 'puppeteer'

export interface ScrapedProduct {
  name: string
  sku?: string
  price?: number
  url?: string
}

const findFirstSelector = async (page: Page, selectors: string[]): Promise<string | null> => {
  for (const selector of selectors) {
    const handle = await page.$(selector)
    if (handle) {
      await handle.dispose()
      return selector
    }
  }

  return null
}

async function authenticateAlek(browser: Browser, loginUrl: string, username: string, password: string): Promise<void> {
  const page = await browser.newPage()
  try {
    await page.goto(loginUrl, { waitUntil: 'networkidle2' })

    const usernameSelector = await findFirstSelector(page, [
      'input[name="email"]',
      'input[type="email"]',
      '#username',
      'input[name="username"]'
    ])
    const passwordSelector = await findFirstSelector(page, [
      'input[name="password"]',
      'input[type="password"]',
      '#password'
    ])
    const submitSelector = await findFirstSelector(page, ['button[type="submit"]', 'input[type="submit"]', 'button'])

    if (!usernameSelector || !passwordSelector || !submitSelector) {
      throw new Error('Alelek login form fields not found.')
    }

    await page.type(usernameSelector, username)
    await page.type(passwordSelector, password)

    await Promise.all([page.click(submitSelector), page.waitForNavigation({ waitUntil: 'networkidle2' })])
  } finally {
    await page.close()
  }
}

export async function scrapeAlekCategories(
  categoryUrls: string[] = [],
  options: { headless?: boolean; timeout?: number } = {}
): Promise<ScrapedProduct[]> {
  const { headless = true, timeout = 30000 } = options
  let browser: Browser | null = null

  try {
    browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const products: ScrapedProduct[] = []
    const defaultCategories = ['https://webshop.groepalelek.be/nl/producten/data-en-alarm-telefonie-netwerk-dz3v']

    const urlsToScrape = categoryUrls.length > 0 ? categoryUrls : defaultCategories

    for (const categoryUrl of urlsToScrape) {
      const categoryProducts = await scrapeCategoryPage(browser, categoryUrl, timeout)
      products.push(...categoryProducts)
    }

    return products
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

const sleep = async (duration: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, duration))
}

async function scrapeCategoryPage(browser: Browser, categoryUrl: string, timeout: number): Promise<ScrapedProduct[]> {
  const page = await browser.newPage()
  const products: ScrapedProduct[] = []

  try {
    page.setDefaultTimeout(timeout)
    page.setDefaultNavigationTimeout(timeout)

    await page.goto(categoryUrl, { waitUntil: 'networkidle2' })

    // Accept cookies if present
    try {
      const cookieButton = await page.$('[id*="cookie"]')
      if (cookieButton) {
        await page.click('[id*="cookie"]')
        await sleep(500)
      }
    } catch {
      // Cookie banner may not be present
    }

    // Wait for product cards to load
    await page
      .waitForSelector('[data-testid="product-card"], .product-card, [class*="product"]', {
        timeout: 5000
      })
      .catch(() => null)

    // Extract products from page
    const pageProducts = await page.evaluate(() => {
      const items: ScrapedProduct[] = []

      // Try multiple selectors for product cards
      const selectors = [
        '[data-testid="product-card"]',
        '.product-card',
        '[class*="product"]',
        '[class*="item"]',
        'a[href*="/nl/product/"]'
      ]

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          elements.forEach((el) => {
            const nameEl = el.querySelector('[class*="name"], [class*="title"], h2, h3')
            const priceEl = el.querySelector('[class*="price"], [class*="cost"]')
            const skuEl = el.querySelector('[class*="sku"], [class*="code"]')

            const name = nameEl?.textContent?.trim()
            const sku = skuEl?.textContent?.trim()
            const priceText = priceEl?.textContent?.trim()
            const href = (el as HTMLAnchorElement).href || ''

            if (name) {
              const price = parsePrice(priceText)
              items.push({
                name,
                ...(sku && { sku }),
                ...(price && { price }),
                ...(href && { url: href })
              })
            }
          })
          break
        }
      }

      return items
    })

    products.push(...pageProducts)

    // Check for pagination and scrape next pages
    const nextPageUrl = await page.evaluate(() => {
      const nextByRel = document.querySelector('a[rel="next"]') as HTMLAnchorElement | null
      if (nextByRel?.href) return nextByRel.href

      const nextByAria = Array.from(document.querySelectorAll('a[aria-label], button[aria-label]')).find((element) => {
        const label = element.getAttribute('aria-label')?.toLowerCase() || ''
        return label.includes('next') || label.includes('volgende')
      })

      if (nextByAria instanceof HTMLAnchorElement && nextByAria.href) {
        return nextByAria.href
      }

      const nextByText = Array.from(document.querySelectorAll('a')).find((anchor) => {
        const text = anchor.textContent?.trim().toLowerCase() || ''
        return text === 'volgende' || text === 'next' || text.includes('volgende')
      }) as HTMLAnchorElement | undefined

      return nextByText?.href || ''
    })

    if (nextPageUrl && nextPageUrl !== categoryUrl && !nextPageUrl.includes('page=999')) {
      const nextPageProducts = await scrapeCategoryPage(browser, nextPageUrl, timeout)
      products.push(...nextPageProducts)
    }
  } finally {
    await page.close()
  }

  return products
}

function parsePrice(priceText?: string): number | undefined {
  if (!priceText) return undefined

  // Match patterns like "€ 12,50", "€12.50", "$12.50", "12,50 €", etc.
  const match = priceText.match(/[\d,.\s]+/)
  if (!match) return undefined

  let priceStr = match[0]
    .replace(/\s/g, '') // remove spaces
    .replace(',', '.') // handle European decimal

  const price = parseFloat(priceStr)
  return isNaN(price) ? undefined : price
}

export async function scrapeAlekProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  let browser: Browser | null = null

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const page = await browser.newPage()

    try {
      await page.goto(productUrl, { waitUntil: 'networkidle2' })

      // Wait for product info to load
      await page
        .waitForSelector('[class*="product"], article, main', {
          timeout: 5000
        })
        .catch(() => null)

      const product = await page.evaluate((url) => {
        const nameEl = document.querySelector('h1, [class*="name"]')
        const priceEl = document.querySelector('[class*="price"]')
        const skuEl = document.querySelector('[class*="sku"], [class*="article"]')

        return {
          name: nameEl?.textContent?.trim(),
          sku: skuEl?.textContent?.trim(),
          price: priceEl?.textContent?.trim(),
          url
        }
      }, productUrl)

      if (!product.name) return null

      return {
        name: product.name,
        sku: product.sku,
        price: parsePrice(product.price),
        url: product.url
      }
    } finally {
      await page.close()
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

export async function scrapeAlekWithAuth(
  categoryUrls: string[],
  options: { headless?: boolean; timeout?: number; username: string; password: string }
): Promise<ScrapedProduct[]> {
  const { headless = true, timeout = 30000, username, password } = options
  let browser: Browser | null = null

  try {
    browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const loginUrl = 'https://webshop.groepalelek.be/nl/login'
    await authenticateAlek(browser, loginUrl, username, password)

    const products: ScrapedProduct[] = []
    for (const categoryUrl of categoryUrls) {
      const categoryProducts = await scrapeCategoryPage(browser, categoryUrl, timeout)
      products.push(...categoryProducts)
    }

    return products
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
