import { test } from 'node:test'
import assert from 'node:assert'
// @ts-ignore -- Node's test runner executes TypeScript directly.
import { importCartText } from '../server/helpers/cart-import.ts'

const products = [
  {
    id: 'desco-kraan',
    name: 'Testkraan',
    price: 19.95,
    source: 'desco' as const,
    articleNumber: 'D-123',
    productNumber: 'P-456',
    unit: 'stuk'
  },
  {
    id: 'alelek-kabel',
    name: 'Testkabel',
    price: 8,
    source: 'alelek' as const,
    articleNumber: 'A-999'
  }
]

test('imports a supplier cart by article number and quantity', () => {
  const result = importCartText('Artikelnummer;Omschrijving;Aantal\nD-123;Testkraan;3', 'desco', products)
  assert.strictEqual(result.materials.length, 1)
  assert.strictEqual(result.materials[0].name, 'Testkraan')
  assert.strictEqual(result.materials[0].quantity, 3)
  assert.deepStrictEqual(result.unmatched, [])
})

test('keeps unmatched cart rows visible and respects the selected supplier', () => {
  const result = importCartText('A-999\nONBEKEND', 'desco', products)
  assert.strictEqual(result.materials.length, 0)
  assert.deepStrictEqual(result.unmatched, ['A-999', 'ONBEKEND'])
})

test('treats ambiguous names and manufacturer numbers as unmatched', () => {
  const variant = { ...products[0], id: 'variant', articleNumber: 'D-124' }
  const result = importCartText('Productnummer;Productnaam;Aantal\nP-456;Testkraan;2\n;Testkraan;1', 'desco', [...products, variant])
  assert.equal(result.materials.length, 0)
  assert.equal(result.unmatched.length, 2)
  const exact = importCartText('Artikelnummer;Productnummer;Aantal\nD-124;P-456;2', 'desco', [...products, variant])
  assert.equal(exact.materials[0].articleNumber, 'D-124')
})

test('does not mistake part of another code or a quantity for an article', () => {
  const wrongCode = importCartText('D-12345\nD-123-extra', 'desco', products)
  assert.deepEqual(wrongCode.unmatched, ['D-12345', 'D-123-extra'])
  const unknown = importCartText('Artikelnummer;Productnaam;Aantal\nD-999;Testkraan;3', 'desco', products)
  assert.equal(unknown.materials.length, 0)
  assert.deepEqual(unknown.unmatched, ['D-999;Testkraan;3'])
})
