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
