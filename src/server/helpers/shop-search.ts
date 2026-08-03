export type SearchableShopProduct = {
  name: string
  articleNumber?: string
  productNumber?: string
  description?: string
  source?: string
  technicalData?: Record<string, string>
  manufacturerData?: Record<string, string>
}

const BRAND_LABEL = /^(merk|brand|fabrikant|manufacturer|producent)$/i

export const normalizeShopSearchText = (value: unknown): string =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const recordSearchText = (record?: Record<string, string>): string =>
  Object.entries(record || {})
    .flatMap(([label, value]) => [label, value])
    .map(normalizeShopSearchText)
    .filter(Boolean)
    .join(' ')

export const getShopProductBrands = (product: SearchableShopProduct): string[] => {
  const records = [product.manufacturerData, product.technicalData]
  const brands = records.flatMap((record) =>
    Object.entries(record || {})
      .filter(([label]) => BRAND_LABEL.test(label.trim()))
      .map(([, value]) => String(value || '').trim())
      .filter(Boolean)
  )
  return [...new Set(brands)]
}

const scoreTerm = (term: string, product: SearchableShopProduct, brands: string[]): number => {
  const name = normalizeShopSearchText(product.name)
  const article = normalizeShopSearchText(product.articleNumber)
  const productNumber = normalizeShopSearchText(product.productNumber)
  const normalizedBrands = brands.map(normalizeShopSearchText)
  let score = 0

  for (const brand of normalizedBrands) {
    if (brand === term) score += 2_000
    else if (brand.startsWith(term)) score += 1_600
    else if (brand.includes(term)) score += 1_300
  }

  const nameIndex = name.indexOf(term)
  if (nameIndex >= 0) score += 1_000 - Math.min(nameIndex, 900)
  if (article === term || article.startsWith(term)) score += 500
  else if (article.includes(term)) score += 200
  if (productNumber === term || productNumber.startsWith(term)) score += 300
  else if (productNumber.includes(term)) score += 100

  return score
}

export const searchShopProducts = <T extends SearchableShopProduct>(products: T[], query: string): T[] => {
  const terms = normalizeShopSearchText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return products

  return products
    .map((product) => {
      const brands = getShopProductBrands(product)
      const fullText = [
        product.name,
        product.articleNumber,
        product.productNumber,
        product.description,
        product.source,
        ...brands,
        recordSearchText(product.manufacturerData),
        recordSearchText(product.technicalData)
      ]
        .map(normalizeShopSearchText)
        .filter(Boolean)
        .join(' ')

      if (!terms.every((term) => fullText.includes(term))) return null
      const score = terms.reduce((total, term) => total + scoreTerm(term, product, brands), 0)
      return { product, score }
    })
    .filter((item): item is { product: T; score: number } => item !== null)
    .sort((left, right) => right.score - left.score)
    .map(({ product }) => product)
}
