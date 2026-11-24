import type { Invoice, MaterialLine } from '../types/index.js'

export const materialSubtotal = (materials: MaterialLine[] = []) =>
  materials.reduce((sum, line) => sum + line.quantity * (line.unitPrice || 0), 0)

export function materialDiscountContext(percent: number | undefined, otherInvoices: Invoice[]) {
  const rate = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent!)) : 0
  let previousSubtotal = 0
  let previousDiscountCents = 0
  for (const invoice of otherInvoices) {
    if (invoice.jobMaterialDiscountPercent !== rate) continue
    previousSubtotal += materialSubtotal(invoice.materials)
    previousDiscountCents += Math.round((invoice.jobMaterialDiscountAmount || 0) * 100)
  }
  return { rate, previousSubtotal, previousDiscountCents }
}

export type MaterialDiscountContext = ReturnType<typeof materialDiscountContext>

export function allocateMaterialDiscount(subtotal: number, context: MaterialDiscountContext): number {
  if (!context.rate || !Number.isFinite(subtotal) || subtotal <= 0) return 0
  const cumulative = Math.round((context.previousSubtotal + subtotal) * context.rate + 1e-8)
  return Math.max(0, Math.min(Math.round(subtotal * 100 + 1e-8), cumulative - context.previousDiscountCents)) / 100
}
