import assert from 'node:assert/strict'
import test from 'node:test'
import type { Invoices, Invoice, Quote } from '../types/index.js'
import { findQuoteInvoiceId } from '../server/helpers/quote-invoices.ts'
import { createKeyedQueue } from '../server/helpers/keyed-queue.ts'

const quote = { id: 'offer-1', jobId: 'job-1' } as Quote
const invoice = { quoteId: quote.id, job: quote.jobId } as Invoice

test('herkent een bestaande factuur zonder terugkoppeling op de offerte', () => {
  const invoices = { 'invoice-1': invoice }
  assert.equal(findQuoteInvoiceId(quote.id, quote, invoices), 'invoice-1')
  assert.equal(findQuoteInvoiceId(quote.id, { ...quote, convertedInvoiceId: 'deleted' }, invoices), 'invoice-1')
  assert.equal(findQuoteInvoiceId(quote.id, quote, {}), undefined)
})

test('een geldige oude koppeling wordt hergebruikt, een koppeling naar een andere offerte niet', () => {
  const legacy = { ...quote, convertedInvoiceId: 'legacy' }
  assert.equal(findQuoteInvoiceId(quote.id, legacy, {
    legacy: { ...invoice, quoteId: undefined }
  }), 'legacy')
  assert.equal(findQuoteInvoiceId(quote.id, legacy, {
    legacy: { ...invoice, quoteId: 'another-quote' }
  }), undefined)
})

test('gelijktijdige verzoeken controleren opnieuw na de eerste conversie', async () => {
  const invoices: Invoices = {}
  const run = createKeyedQueue()
  let creates = 0
  const convert = () => run(quote.id, async () => {
    const existing = findQuoteInvoiceId(quote.id, quote, invoices)
    if (existing) return existing
    const id = `invoice-${++creates}`
    await Promise.resolve()
    invoices[id] = invoice
    return id
  })
  assert.deepEqual(await Promise.all([convert(), convert(), convert()]), ['invoice-1', 'invoice-1', 'invoice-1'])
  assert.equal(creates, 1)
})

test('na een fout na het aanmaken hervat een wachtend verzoek met dezelfde factuur', async () => {
  const invoices: Invoices = {}
  const run = createKeyedQueue()
  const first = run(quote.id, async () => {
    invoices['invoice-1'] = invoice
    throw new Error('Opslaan van uren mislukt')
  })
  const retry = run(quote.id, async () => findQuoteInvoiceId(quote.id, quote, invoices))
  await assert.rejects(first, /Opslaan van uren mislukt/)
  assert.equal(await retry, 'invoice-1')
})
