import type { MaterialLine } from '../../types/index.js'

export const normalizeInvoiceMaterials = (value: unknown): MaterialLine[] => {
  if (!Array.isArray(value)) return []

  const normalized: MaterialLine[] = []

  for (const item of value) {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const quantity = Number(item?.quantity)
    const unit = typeof item?.unit === 'string' ? item.unit.trim() : ''
    const unitPriceRaw = item?.unitPrice
    const unitPrice =
      unitPriceRaw === undefined || unitPriceRaw === null || unitPriceRaw === '' ? undefined : Number(unitPriceRaw)
    const validPrice = unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined
    const small = item?.kind === 'small-materials'
    const fallbackAmount = Number(item?.smallMaterialAmount)
    const surcharge = validPrice ?? (Number.isFinite(fallbackAmount) && fallbackAmount >= 0 ? fallbackAmount : 0)

    if (!name) continue

    normalized.push({
      name,
      quantity: !small && Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: unit || undefined,
      unitPrice: small ? surcharge : validPrice,
      kind: small ? 'small-materials' : 'material',
      smallMaterialAmount: small ? surcharge : undefined,
      articleNumber: typeof item?.articleNumber === 'string' ? item.articleNumber.trim() || undefined : undefined,
      productNumber: typeof item?.productNumber === 'string' ? item.productNumber.trim() || undefined : undefined,
      packagingQuantity: Number.isFinite(Number(item?.packagingQuantity)) ? Number(item.packagingQuantity) : undefined,
      description: typeof item?.description === 'string' ? item.description : undefined,
      image: typeof item?.image === 'string' ? item.image : undefined,
      technicalData: item?.technicalData && typeof item.technicalData === 'object' ? item.technicalData : undefined
    })
  }

  return normalized
}
