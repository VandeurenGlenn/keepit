import type { MaterialLine } from '../../types/index.js'

const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase('nl')

export const materialBillingKey = (material: MaterialLine): string => {
  if (material.kind === 'small-materials') return 'kind:small-materials'
  if (material.articleNumber?.trim()) return `article:${normalized(material.articleNumber)}`
  if (material.productNumber?.trim()) return `product:${normalized(material.productNumber)}`
  return `name:${normalized(material.name)}|unit:${normalized(material.unit)}`
}

const billingAmount = (material: MaterialLine): number => {
  const value = Number(material.kind === 'small-materials'
    ? material.smallMaterialAmount ?? material.unitPrice
    : material.quantity)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export const findMaterialOverbilling = (
  requested: MaterialLine[],
  jobMaterials: MaterialLine[],
  remaining: MaterialLine[]
): MaterialLine | undefined => {
  const trackedKeys = new Set(jobMaterials.map(materialBillingKey))
  const available = new Map(remaining.map((line) => [materialBillingKey(line), billingAmount(line)]))
  const totals = new Map<string, number>()
  for (const line of requested) {
    const key = materialBillingKey(line)
    if (!trackedKeys.has(key)) continue
    const total = (totals.get(key) || 0) + billingAmount(line)
    if (total > (available.get(key) || 0) + 0.000_001) return line
    totals.set(key, total)
  }
}

export const collectRemainingMaterials = (
  jobMaterials: MaterialLine[] = [],
  invoicedMaterials: MaterialLine[] = []
): MaterialLine[] => {
  const invoicedQuantities = new Map<string, number>()
  let invoicedSmallMaterialAmount = 0
  for (const material of invoicedMaterials) {
    const key = materialBillingKey(material)
    if (key === 'kind:small-materials') {
      invoicedSmallMaterialAmount += Number(material.smallMaterialAmount ?? material.unitPrice) || 0
      continue
    }
    invoicedQuantities.set(key, (invoicedQuantities.get(key) || 0) + Math.max(0, Number(material.quantity) || 0))
  }

  const available = new Map<string, MaterialLine>()
  for (const material of jobMaterials) {
    const key = materialBillingKey(material)
    const existing = available.get(key)
    if (key === 'kind:small-materials') {
      const amount = Number(material.smallMaterialAmount ?? material.unitPrice) || 0
      available.set(key, {
        ...(existing || material),
        ...material,
        quantity: 1,
        unitPrice: (Number(existing?.unitPrice) || 0) + amount,
        smallMaterialAmount: (Number(existing?.smallMaterialAmount) || 0) + amount
      })
      continue
    }
    available.set(key, {
      ...(existing || material),
      ...material,
      quantity: (Number(existing?.quantity) || 0) + Math.max(0, Number(material.quantity) || 0)
    })
  }

  const remaining: MaterialLine[] = []
  for (const [key, material] of available) {
    if (key === 'kind:small-materials') {
      const currentAmount = Number(material.smallMaterialAmount ?? material.unitPrice) || 0
      const amount = Math.max(0, currentAmount - invoicedSmallMaterialAmount)
      if (amount > 0.000_001) {
        remaining.push({
          ...material,
          name: 'Klein materiaal',
          quantity: 1,
          unit: material.unit || 'toeslag',
          unitPrice: amount,
          smallMaterialAmount: amount
        })
      }
      continue
    }
    const quantity = Math.max(0, Number(material.quantity) - (invoicedQuantities.get(key) || 0))
    if (quantity > 0.000_001) remaining.push({ ...material, quantity })
  }
  return remaining
}
