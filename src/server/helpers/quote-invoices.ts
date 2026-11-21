import type { Invoices, Quote } from '../../types/index.js'

export function indexQuoteInvoices(invoices: Invoices): Map<string, string> {
  const index = new Map<string, string>()
  for (const [id, invoice] of Object.entries(invoices)) {
    if (invoice.quoteId && !index.has(invoice.quoteId)) index.set(invoice.quoteId, id)
  }
  return index
}

export function findQuoteInvoiceId(
  quoteId: string,
  quote: Quote,
  invoices: Invoices,
  index = indexQuoteInvoices(invoices)
): string | undefined {
  const linkedId = quote.convertedInvoiceId
  const linked = linkedId && Object.hasOwn(invoices, linkedId) ? invoices[linkedId] : undefined
  if (linked && (linked.quoteId === quoteId || (!linked.quoteId && linked.job === quote.jobId))) return linkedId
  return index.get(quoteId)
}
