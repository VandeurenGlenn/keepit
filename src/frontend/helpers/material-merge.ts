import type { MaterialLine } from '../../types/index.js'

const normalized = (value?: string) => value?.trim().toLowerCase() || ''

export function mergeMaterialRows<T extends MaterialLine>(current: T[], incoming: T[]): T[] {
  const result = [...current]
  for (const row of incoming) {
    if (!row.name.trim() || !Number.isFinite(row.quantity) || row.quantity <= 0) continue
    const index = result.findIndex((line) => {
      if (line.kind === 'small-materials' || row.kind === 'small-materials') return false
      const article = normalized(row.articleNumber)
      const product = normalized(row.productNumber)
      return normalized(line.articleNumber) === article &&
        normalized(line.productNumber) === product &&
        (Boolean(article || product) || normalized(line.name) === normalized(row.name)) &&
        normalized(line.unit) === normalized(row.unit) &&
        line.packagingQuantity === row.packagingQuantity &&
        line.unitPrice === row.unitPrice
    })
    if (index < 0) result.push({ ...row })
    else result[index] = { ...result[index], quantity: result[index].quantity + row.quantity }
  }
  return result
}
