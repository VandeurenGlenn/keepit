import type { MaterialLine } from '../../types/index.js'

const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase('nl')

export const materialBillingKey = (material: MaterialLine): string => {
  if (material.kind === 'small-materials') return 'kind:small-materials'
  if (material.articleNumber?.trim()) return `article:${normalized(material.articleNumber)}`
  if (material.productNumber?.trim()) return `product:${normalized(material.productNumber)}`
  return `name:${normalized(material.name)}|unit:${normalized(material.unit)}`
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
