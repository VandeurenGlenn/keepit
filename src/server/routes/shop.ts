import { Router } from '@koa/router'
import { shopOrders, shopOrdersStore } from '../database/database.js'
import { readDescoCatalog } from '../helpers/desco.js'
import { readAlelekCatalog } from '../helpers/alelek.js'
import { MaterialLine, ShopProduct, ShopOrder } from '../../types/index.js'
import { getAuthToken } from './../middleware/auth.js'
import { getFavorites, getHistory } from '../helpers/material-preferences.js'
import { importCartText, type CartImportSource } from '../helpers/cart-import.js'
import { getCatalogImageUrls, getProductImage, type ProductImageVariant } from '../helpers/product-images.js'
import { getShopProductBrands } from '../helpers/shop-search.js'
import { searchShopIndex } from '../helpers/shop-search-index.js'

const router = new Router({ prefix: '/api/shop' })
const publicImageRouter = new Router({ prefix: '/api/shop' })

const generateProductId = (item: Pick<MaterialLine, 'name' | 'articleNumber' | 'productNumber'>, source: string): string => {
  const identity = item.articleNumber || item.productNumber || item.name
  const slug = identity.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${source}-${slug}`
}

const toShopProduct = (item: MaterialLine, source: 'desco' | 'alelek'): ShopProduct => ({
  id: generateProductId(item, source),
  name: item.name,
  price: item.unitPrice || 0,
  quantity: item.quantity,
  unit: item.unit,
  source,
  articleNumber: item.articleNumber,
  productNumber: item.productNumber,
  packagingQuantity: item.packagingQuantity,
  description: item.description,
  image: item.image,
  technicalData: item.technicalData,
  manufacturerData: item.manufacturerData,
  dataSources: item.dataSources,
  imageCandidates: item.imageCandidates
})

const getProductCategory = (product: ShopProduct): string => {
  const text = `${product.name} ${product.description || ''}`.toLowerCase()
  if (/douche|bad\b|toilet|\bwc\b|spoel/.test(text)) return 'Sanitair'
  if (/kraan|mengkraan|tapkraan/.test(text)) return 'Kranen'
  if (/ketel|brander|boiler|radiator|verwarm|thermostaat/.test(text)) return 'Verwarming'
  if (/pomp|circulat/.test(text)) return 'Pompen'
  if (/buis|bocht|mof\b|koppeling|fitting|leiding/.test(text)) return 'Leidingen & fittingen'
  if (/tang|zaag|boor|sleutel|gereedschap/.test(text)) return 'Gereedschap'
  if (/ventiel|klep|afsluiter/.test(text)) return 'Kleppen & ventielen'
  return 'Installatiemateriaal'
}

const parseNonNegativeInteger = (value: unknown): number | undefined => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

/**
 * GET /api/shop/image?url=<catalog image>&variant=card|detail
 * Returns an already prepared WebP sized for its shop view.
 * This endpoint never downloads or converts images during runtime.
 * Only URLs already present in our trusted product catalogs are accepted.
 */
publicImageRouter.get('/image', async (ctx) => {
  const imageUrl = typeof ctx.query.url === 'string' ? ctx.query.url : ''
  const variant: ProductImageVariant = ctx.query.variant === 'detail' ? 'detail' : 'card'
  if (!imageUrl || !(await getCatalogImageUrls()).has(imageUrl)) {
    ctx.status = 404
    ctx.body = { error: 'Unknown product image' }
    return
  }

  try {
    ctx.body = await getProductImage(imageUrl, variant)
    ctx.status = 200
    ctx.set('Content-Type', 'image/webp')
    ctx.set('Cache-Control', 'private, max-age=604800, immutable')
    ctx.set('Vary', 'Accept-Encoding')
  } catch (error) {
    ctx.status = 404
    ctx.body = { error: 'Product image unavailable' }
  }
})

/**
 * GET /api/shop/products
 * Returns merged product catalog from Desco + Alelek
 * Query params: ?search=<term> for filtering
 */
router.get('/products', async (ctx) => {
  try {
    const [descoCatalog, alekCatalog] = await Promise.all([readDescoCatalog(), readAlelekCatalog()])
    const search = typeof ctx.query.search === 'string' ? ctx.query.search : ''
    const hasSearch = Boolean(search.trim())
    const popular = String(ctx.query.popular).toLowerCase() === 'true'
    const source = typeof ctx.query.source === 'string' ? ctx.query.source : 'all'
    const category = typeof ctx.query.category === 'string' ? ctx.query.category : 'all'
    const price = typeof ctx.query.price === 'string' ? ctx.query.price : 'all'
    const favoritesOnly = String(ctx.query.favoritesOnly).toLowerCase() === 'true'
    const hasFilters = source !== 'all' || category !== 'all' || price !== 'all' || favoritesOnly
    const offset = parseNonNegativeInteger(ctx.query.offset) || 0
    const limit = parseNonNegativeInteger(ctx.query.limit)
    const total = descoCatalog.items.length + alekCatalog.items.length

    if (!hasSearch && !popular && !hasFilters) {
      const pageEnd = limit === undefined ? total : Math.min(total, offset + limit)
      const descoPage = descoCatalog.items
        .slice(offset, Math.min(pageEnd, descoCatalog.items.length))
        .map((item) => toShopProduct(item, 'desco'))
      const alelekStart = Math.max(0, offset - descoCatalog.items.length)
      const alelekEnd = Math.max(0, pageEnd - descoCatalog.items.length)
      const alelekPage = alekCatalog.items.slice(alelekStart, alelekEnd).map((item) => toShopProduct(item, 'alelek'))

      ctx.body = {
        total,
        products: [...descoPage, ...alelekPage]
      }
      ctx.status = 200
      return
    }

    if (hasSearch) {
      const favoriteNames = favoritesOnly ? (await getFavorites()).map((material) => material.name) : undefined
      const indexed = await searchShopIndex(
        [
          { source: 'desco', updatedAt: descoCatalog.updatedAt, items: descoCatalog.items },
          { source: 'alelek', updatedAt: alekCatalog.updatedAt, items: alekCatalog.items }
        ],
        search,
        { source, category, price, favoriteNames },
        limit,
        offset
      )
      const products = indexed.matches.map((match) => {
        const items = match.source === 'desco' ? descoCatalog.items : alekCatalog.items
        return toShopProduct(items[match.itemIndex], match.source)
      })

      ctx.body = { total: indexed.total, products }
      ctx.status = 200
      return
    }

    let filtered: ShopProduct[] = [
      ...descoCatalog.items.map((item) => toShopProduct(item, 'desco')),
      ...alekCatalog.items.map((item) => toShopProduct(item, 'alelek'))
    ]

    if (source !== 'all') filtered = filtered.filter((product) => product.source === source)
    if (category !== 'all') filtered = filtered.filter((product) => getProductCategory(product) === category)
    if (price === 'under-25') filtered = filtered.filter((product) => product.price < 25)
    if (price === '25-100') filtered = filtered.filter((product) => product.price >= 25 && product.price <= 100)
    if (price === '100-plus') filtered = filtered.filter((product) => product.price > 100)
    if (favoritesOnly) {
      const favoriteNames = new Set((await getFavorites()).map((material) => material.name))
      filtered = filtered.filter((product) => favoriteNames.has(product.name))
    }

    if (popular && !hasSearch) {
      const [history, favorites] = await Promise.all([getHistory(), getFavorites()])
      const ranks = new Map<string, number>()
      favorites.forEach((material, index) => ranks.set(material.name.toLowerCase(), 10_000 - index))
      history.forEach((material, index) => {
        const key = material.name.toLowerCase()
        ranks.set(key, Math.max(ranks.get(key) || 0, (material.usageCount || 1) * 100 - index))
      })
      filtered = filtered
        .filter((product) => ranks.has(product.name.toLowerCase()))
        .sort((left, right) => (ranks.get(right.name.toLowerCase()) || 0) - (ranks.get(left.name.toLowerCase()) || 0))
    }

    const pagedProducts = limit === undefined ? filtered.slice(offset) : filtered.slice(offset, offset + limit)

    ctx.body = {
      total: filtered.length,
      products: pagedProducts
    }
    ctx.status = 200
  } catch (error) {
    ctx.body = {
      error: error instanceof Error ? error.message : 'Failed to fetch products'
    }
    ctx.status = 500
  }
})

router.post('/cart-import', async (ctx) => {
  const body = (ctx.request.body || {}) as { source?: unknown; text?: unknown }
  const source = body.source === 'desco' || body.source === 'alelek' ? (body.source as CartImportSource) : undefined
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!source || !text || text.length > 1_000_000) {
    ctx.status = 400
    ctx.body = { error: 'Kies Desco of Alelek en geef maximaal 1 MB winkelwagengegevens mee.' }
    return
  }

  const [descoCatalog, alelekCatalog] = await Promise.all([readDescoCatalog(), readAlelekCatalog()])
  const products: ShopProduct[] = [
    ...descoCatalog.items.map((item) => ({
      id: generateProductId(item, 'desco'),
      name: item.name,
      price: item.unitPrice || 0,
      source: 'desco' as const,
      ...item
    })),
    ...alelekCatalog.items.map((item) => ({
      id: generateProductId(item, 'alelek'),
      name: item.name,
      price: item.unitPrice || 0,
      source: 'alelek' as const,
      ...item
    }))
  ]

  ctx.body = importCartText(text, source, products)
  ctx.status = 200
})

/**
 * GET /api/shop/autocomplete
 * Returns product suggestions for autocomplete
 * Query params: ?q=<search term> for suggestions
 */
router.get('/autocomplete', async (ctx) => {
  try {
    const query = ((ctx.query.q as string) || '').toLowerCase().trim()
    if (!query) {
      ctx.body = { suggestions: [] }
      ctx.status = 200
      return
    }

    const [descoCatalog, alekCatalog] = await Promise.all([readDescoCatalog(), readAlelekCatalog()])

    const suggestions = new Map<string, { text: string; count: number }>()

    // Collect suggestions from product names and article numbers
    const addSuggestion = (text: string) => {
      const normalized = text.toLowerCase().trim()
      if (!normalized || !normalized.includes(query)) return

      const key = normalized
      const existing = suggestions.get(key)
      suggestions.set(key, { text: normalized, count: (existing?.count ?? 0) + 1 })
    }

    // Process Desco items
    descoCatalog.items.forEach((item) => {
      addSuggestion(item.name)
      if (item.articleNumber) addSuggestion(item.articleNumber)
      if (item.productNumber) addSuggestion(item.productNumber)
      getShopProductBrands(item).forEach(addSuggestion)
    })

    // Process Alelek items
    alekCatalog.items.forEach((item) => {
      addSuggestion(item.name)
      if (item.articleNumber) addSuggestion(item.articleNumber)
      if (item.productNumber) addSuggestion(item.productNumber)
      getShopProductBrands(item).forEach(addSuggestion)
    })

    // Sort by relevance: match position, then frequency
    const sorted = Array.from(suggestions.values())
      .sort((a, b) => {
        const aPos = a.text.indexOf(query)
        const bPos = b.text.indexOf(query)
        if (aPos !== bPos) return aPos - bPos
        return b.count - a.count
      })
      .slice(0, 10)
      .map((s) => s.text)

    ctx.body = { suggestions: sorted }
    ctx.status = 200
  } catch (error) {
    ctx.body = {
      error: error instanceof Error ? error.message : 'Failed to fetch suggestions'
    }
    ctx.status = 500
  }
})

/**
 * GET /api/shop/orders
 * Returns authenticated user's orders
 */
router.get('/orders', async (ctx) => {
  try {
    const token = await getAuthToken(ctx)
    if (!token) {
      ctx.body = { error: 'Unauthorized' }
      ctx.status = 401
      return
    }

    const userOrders = Object.values(shopOrders).filter((order) => order.userId === token)

    ctx.body = {
      total: userOrders.length,
      orders: userOrders
    }
    ctx.status = 200
  } catch (error) {
    ctx.body = {
      error: error instanceof Error ? error.message : 'Failed to fetch orders'
    }
    ctx.status = 500
  }
})

/**
 * GET /api/shop/orders/:orderId
 * Returns order details if user owns the order
 */
router.get('/orders/:orderId', async (ctx) => {
  try {
    const token = await getAuthToken(ctx)
    if (!token) {
      ctx.body = { error: 'Unauthorized' }
      ctx.status = 401
      return
    }

    const order = shopOrders[ctx.params.orderId]
    if (!order) {
      ctx.body = { error: 'Order not found' }
      ctx.status = 404
      return
    }

    if (order.userId !== token) {
      ctx.body = { error: 'Forbidden' }
      ctx.status = 403
      return
    }

    ctx.body = order
    ctx.status = 200
  } catch (error) {
    ctx.body = {
      error: error instanceof Error ? error.message : 'Failed to fetch order'
    }
    ctx.status = 500
  }
})

/**
 * POST /api/shop/orders
 * Create a new order
 * Body: { items: [{ productId, quantity }], shippingAddress?, notes? }
 */
router.post('/orders', async (ctx) => {
  try {
    const token = await getAuthToken(ctx)
    if (!token) {
      ctx.body = { error: 'Unauthorized' }
      ctx.status = 401
      return
    }

    const body = (ctx.request.body || {}) as {
      items?: Array<{ productId: string; quantity: number }>
      shippingAddress?: string
      notes?: string
    }

    if (!body.items || body.items.length === 0) {
      ctx.body = { error: 'Order must contain at least one item' }
      ctx.status = 400
      return
    }

    // Fetch current products to validate and get prices
    const [descoCatalog, alekCatalog] = await Promise.all([readDescoCatalog(), readAlelekCatalog()])

    const allProducts: Map<string, { price: number; name: string }> = new Map()

    descoCatalog.items.forEach((item) => {
      const id = generateProductId(item, 'desco')
      allProducts.set(id, { price: item.unitPrice || 0, name: item.name })
    })

    alekCatalog.items.forEach((item) => {
      const id = generateProductId(item, 'alelek')
      allProducts.set(id, { price: item.unitPrice || 0, name: item.name })
    })

    // Build order items and calculate total
    const orderItems = body.items
      .map((item) => {
        const product = allProducts.get(item.productId)
        if (!product) {
          return null
        }

        const unitPrice = product.price
        const subtotal = unitPrice * item.quantity

        return {
          productId: item.productId,
          name: product.name,
          quantity: item.quantity,
          unitPrice,
          subtotal
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (orderItems.length === 0) {
      ctx.body = { error: 'No valid items found in order' }
      ctx.status = 400
      return
    }

    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const order: ShopOrder = {
      id: orderId,
      name: `Order #${orderId.split('-')[1]}`,
      userId: token,
      items: orderItems,
      total,
      status: 'pending',
      shippingAddress: body.shippingAddress,
      notes: body.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    shopOrders[orderId] = order
    await shopOrdersStore.put(shopOrders)

    ctx.body = {
      ok: true,
      orderId,
      order
    }
    ctx.status = 201
  } catch (error) {
    ctx.body = {
      error: error instanceof Error ? error.message : 'Failed to create order'
    }
    ctx.status = 500
  }
})

/**
 * PATCH /api/shop/orders/:orderId
 * Update order status (admin only, authenticated user who created it)
 * Body: { status: 'confirmed' | 'shipped' | 'delivered' | 'cancelled' }
 */
router.patch('/orders/:orderId', async (ctx) => {
  try {
    const token = await getAuthToken(ctx)
    if (!token) {
      ctx.body = { error: 'Unauthorized' }
      ctx.status = 401
      return
    }

    const order = shopOrders[ctx.params.orderId]
    if (!order) {
      ctx.body = { error: 'Order not found' }
      ctx.status = 404
      return
    }

    if (order.userId !== token) {
      ctx.body = { error: 'Forbidden' }
      ctx.status = 403
      return
    }

    const body = (ctx.request.body || {}) as { status?: string }
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

    if (body.status && validStatuses.includes(body.status)) {
      order.status = body.status as ShopOrder['status']
      order.updatedAt = new Date().toISOString()
      await shopOrdersStore.put(shopOrders)
    }

    ctx.body = order
    ctx.status = 200
  } catch (error) {
    ctx.body = {
      error: error instanceof Error ? error.message : 'Failed to update order'
    }
    ctx.status = 500
  }
})

export const publicShopImages = publicImageRouter.routes()
export default router.routes()
