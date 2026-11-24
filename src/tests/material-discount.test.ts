import assert from 'node:assert/strict'
import test from 'node:test'
import type { Invoice } from '../types/index.js'
import { allocateMaterialDiscount, materialDiscountContext, materialSubtotal } from '../helpers/material-discount.ts'

const line = (price: number) => ({ name: 'Materiaal', unitPrice: price, quantity: 1 })
const invoice = (price: number, rate: number, discount: number) => ({
  materials: [line(price)], jobMaterialDiscountPercent: rate, jobMaterialDiscountAmount: discount
}) as Invoice

test('tussenfacturen krijgen korting op hun eigen materialen, niet op de volledige job', () => {
  const previous = invoice(40, 10, 4)
  assert.equal(allocateMaterialDiscount(materialSubtotal([line(60)]), materialDiscountContext(10, [previous])), 6)
  assert.equal(allocateMaterialDiscount(0, materialDiscountContext(10, [previous])), 0)
})

test('afronding van een vorige tussenfactuur wordt niet nog eens toegekend', () => {
  const context = materialDiscountContext(10, [invoice(0.05, 10, 0.01)])
  assert.equal(allocateMaterialDiscount(0.05, context), 0)
  assert.equal(allocateMaterialDiscount(0.10, materialDiscountContext(10, [])), 0.01)
})

test('vaste offertekortingen en oudere facturen worden niet herberekend', () => {
  const quote = { materials: [line(20)], discountAmount: 8, quoteId: 'offerte' } as Invoice
  const context = materialDiscountContext(10, [quote, invoice(40, 15, 6)])
  assert.equal(allocateMaterialDiscount(60, context), 6)
})
