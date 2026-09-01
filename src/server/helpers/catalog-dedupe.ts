import type { MaterialLine } from '../../types/index.js'

const normalized = (value: unknown) => String(value || '').trim().toLowerCase()

export const dedupeCatalogMaterials = (items: MaterialLine[]): MaterialLine[] => {
  const byIdentity = new Map<string, MaterialLine>()
  for (const item of items) {
    const articleNumber = normalized(item.articleNumber)
    const productNumber = normalized(item.productNumber)
    const name = normalized(item.name)
    if (!articleNumber && !productNumber && !name) continue
    const key = articleNumber
      ? `article:${articleNumber}`
      : productNumber
        ? `product:${productNumber}`
        : `name:${name}`
    const existing = byIdentity.get(key)
    byIdentity.set(key, existing
      ? { ...existing, unit: existing.unit || item.unit, unitPrice: existing.unitPrice ?? item.unitPrice }
      : item)
  }
  return [...byIdentity.values()].sort((left, right) => {
    const articleComparison = normalized(left.articleNumber).localeCompare(normalized(right.articleNumber))
    if (articleComparison) return articleComparison
    return normalized(left.name).localeCompare(normalized(right.name))
  })
}
