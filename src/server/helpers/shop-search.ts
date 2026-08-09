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

export type ScoredShopProduct<T> = {
  product: T
  score: number
}

export const normalizeShopSearchText = (value: unknown): string =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

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

const recordContainsTerm = (record: Record<string, string> | undefined, term: string): boolean =>
  Object.entries(record || {}).some(
    ([label, value]) => normalizeShopSearchText(label).includes(term) || normalizeShopSearchText(value).includes(term)
  )

const productContainsTerm = (
  product: SearchableShopProduct,
  source: string | undefined,
  brands: string[],
  term: string
): boolean => {
  const primaryValues = [product.name, product.articleNumber, product.productNumber, source, ...brands]
  if (primaryValues.some((value) => normalizeShopSearchText(value).includes(term))) return true
  if (normalizeShopSearchText(product.description).includes(term)) return true
  return recordContainsTerm(product.manufacturerData, term) || recordContainsTerm(product.technicalData, term)
}

export const scoreShopProducts = <T extends SearchableShopProduct>(
  products: T[],
  query: string,
  source?: string
): Array<ScoredShopProduct<T>> => {
  const terms = normalizeShopSearchText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return products.map((product) => ({ product, score: 0 }))

  return products
    .map((product) => {
      const brands = getShopProductBrands(product)
      const productSource = product.source || source
      if (!terms.every((term) => productContainsTerm(product, productSource, brands, term))) return null
      const score = terms.reduce((total, term) => total + scoreTerm(term, product, brands), 0)
      return { product, score }
    })
    .filter((item): item is ScoredShopProduct<T> => item !== null)
}

export const searchShopProducts = <T extends SearchableShopProduct>(products: T[], query: string): T[] =>
  scoreShopProducts(products, query)
    .sort((left, right) => right.score - left.score)
    .map(({ product }) => product)
