import type { Invoice, Invoices, MaterialLine } from '../../types/index.js'

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
  const available = new Map<string, number>()
  for (const line of remaining) {
    const key = materialBillingKey(line)
    available.set(key, (available.get(key) || 0) + billingAmount(line))
  }
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
  const invoicedByKey = new Map<string, MaterialLine[]>()
  let invoicedSmallMaterialAmount = 0
  for (const material of invoicedMaterials) {
    const key = materialBillingKey(material)
    if (key === 'kind:small-materials') {
      invoicedSmallMaterialAmount += billingAmount(material)
      continue
    }
    const billed = invoicedByKey.get(key) || []
    billed.push(material)
    invoicedByKey.set(key, billed)
  }

  const groups = new Map<string, MaterialLine[]>()
  let surcharge: MaterialLine | undefined
  let surchargeAmount = 0
  for (const material of jobMaterials) {
    const key = materialBillingKey(material)
    if (key === 'kind:small-materials') {
      surcharge = material
      surchargeAmount += billingAmount(material)
      continue
    }
    const lines = groups.get(key) || []
    lines.push({ ...material, quantity: billingAmount(material) })
    groups.set(key, lines)
  }

  const remaining: MaterialLine[] = []
  for (const [key, lines] of groups) {
    const consume = (quantity: number, matches: (line: MaterialLine) => boolean) => {
      for (const line of lines) {
        if (quantity <= 0) break
        if (!matches(line)) continue
        const taken = Math.min(quantity, line.quantity)
        line.quantity -= taken
        quantity -= taken
      }
      return quantity
    }
    let unmatched = 0
    for (const billed of invoicedByKey.get(key) || []) {
      unmatched += consume(billingAmount(billed), (line) =>
        line.unitPrice === billed.unitPrice && normalized(line.unit) === normalized(billed.unit))
    }
    // A legacy line with a changed or missing price still consumed a quantity.
    consume(unmatched, () => true)
    remaining.push(...lines.filter((line) => line.quantity > 0.000_001))
  }
  const amount = Math.max(0, surchargeAmount - invoicedSmallMaterialAmount)
  if (surcharge && amount > 0.000_001) remaining.push({
    ...surcharge, name: 'Klein materiaal', quantity: 1, unit: surcharge.unit || 'toeslag',
    unitPrice: amount, smallMaterialAmount: amount
  })
  return remaining
}

export function otherJobInvoices(invoices: Invoices, jobId: string, excludeId?: string): Invoice[] {
  return Object.entries(invoices).flatMap(([id, invoice]) => id !== excludeId && invoice.job === jobId ? [invoice] : [])
}
