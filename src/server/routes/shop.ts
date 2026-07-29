import Router from '@koa/router'
import { shopOrders, shopOrdersStore } from '../database/database.js'
import { readDescoCatalog } from '../helpers/desco.js'
import { readAlelekCatalog } from '../helpers/alelek.js'
import { ShopProduct, ShopOrder } from '../../types/index.js'
import { getAuthToken } from './../middleware/auth.js'
import { getFavorites, getHistory } from '../helpers/material-preferences.js'
import { importCartText, type CartImportSource } from '../helpers/cart-import.js'
import { getCatalogImageUrls, getProductImage, type ProductImageVariant } from '../helpers/product-images.js'

const router = new Router({ prefix: '/api/shop' })
const publicImageRouter = new Router({ prefix: '/api/shop' })

const generateProductId = (name: string, source: string): string => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${source}-${slug}`
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
 * Returns a cached WebP sized and compressed for its actual shop view.
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
    console.warn('Product image conversion failed:', error instanceof Error ? error.message : String(error))
    ctx.status = 502
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

    const products: ShopProduct[] = []

    // Add Desco products
    descoCatalog.items.forEach((item) => {
      products.push({
        id: generateProductId(item.name, 'desco'),
        name: item.name,
        price: item.unitPrice || 0,
        quantity: item.quantity,
        unit: item.unit,
        source: 'desco',
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
    })

    // Add Alelek products
    alekCatalog.items.forEach((item) => {
      products.push({
        id: generateProductId(item.name, 'alelek'),
        name: item.name,
        price: item.unitPrice || 0,
        quantity: item.quantity,
        unit: item.unit,
        source: 'alelek',
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
    })

    // Smart search: split by spaces, match all terms, sort by relevance
    const search = (ctx.query.search as string)?.toLowerCase() || ''
    const terms = search.split(/\s+/).filter(Boolean)

    let filtered =
      terms.length === 0
        ? products
        : products
            .map((p) => {
              const nameLower = p.name.toLowerCase()
              const articleLower = (p.articleNumber || '').toLowerCase()
              const productLower = (p.productNumber || '').toLowerCase()
              const fullText = `${nameLower} ${articleLower} ${productLower}`

              // All terms must be present
              const matches = terms.every((t) => fullText.includes(t))
              if (!matches) return null

              // Score by match quality and position
              let score = 0
              terms.forEach((t) => {
                // Name match gets highest score
                const nameIdx = nameLower.indexOf(t)
                if (nameIdx >= 0) score += 1000 - nameIdx

                // Article number exact match or start gets high score
                if (articleLower === t || articleLower.startsWith(t)) score += 500
                else if (articleLower.includes(t)) score += 200

                // Product number match gets medium score
                if (productLower === t || productLower.startsWith(t)) score += 300
                else if (productLower.includes(t)) score += 100
              })

              return { product: p, score }
            })
            .filter((item): item is { product: ShopProduct; score: number } => item !== null)
            .sort((a, b) => b.score - a.score)
            .map((item) => item.product)

    if (String(ctx.query.popular).toLowerCase() === 'true' && terms.length === 0) {
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

    const offset = parseNonNegativeInteger(ctx.query.offset) || 0
    const limit = parseNonNegativeInteger(ctx.query.limit)
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
      id: generateProductId(item.name, 'desco'),
      name: item.name,
      price: item.unitPrice || 0,
      source: 'desco' as const,
      ...item
    })),
    ...alelekCatalog.items.map((item) => ({
      id: generateProductId(item.name, 'alelek'),
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
    })

    // Process Alelek items
    alekCatalog.items.forEach((item) => {
      addSuggestion(item.name)
      if (item.articleNumber) addSuggestion(item.articleNumber)
      if (item.productNumber) addSuggestion(item.productNumber)
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
      const id = generateProductId(item.name, 'desco')
      allProducts.set(id, { price: item.unitPrice || 0, name: item.name })
    })

    alekCatalog.items.forEach((item) => {
      const id = generateProductId(item.name, 'alelek')
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
