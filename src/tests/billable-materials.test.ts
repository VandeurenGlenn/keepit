import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-ignore -- Node's test runner executes TypeScript source directly.
import { collectRemainingMaterials } from '../server/helpers/billable-materials.ts'

test('tussenfacturen trekken reeds gefactureerde materiaalhoeveelheden af', () => {
  const remaining = collectRemainingMaterials(
    [{ name: 'Kabel', articleNumber: 'ABC-1', quantity: 15, unit: 'm', unitPrice: 2 }],
    [{ name: 'Oude kabelnaam', articleNumber: 'ABC-1', quantity: 4, unit: 'm', unitPrice: 2 }]
  )
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].quantity, 11)
  assert.equal(remaining[0].articleNumber, 'ABC-1')
})

test('volledig gefactureerde materialen tellen niet opnieuw mee', () => {
  const remaining = collectRemainingMaterials(
    [{ name: 'Automaat', productNumber: 'P-20', quantity: 2, unit: 'stuk' }],
    [{ name: 'Automaat', productNumber: 'P-20', quantity: 2, unit: 'stuk' }]
  )
  assert.deepEqual(remaining, [])
})

test('latere verhogingen en bijkomend klein materiaal blijven factureerbaar', () => {
  const remaining = collectRemainingMaterials(
    [
      { name: 'Buis', quantity: 8, unit: 'm' },
      { name: 'Klein materiaal', quantity: 1, kind: 'small-materials', unitPrice: 45, smallMaterialAmount: 45 }
    ],
    [
      { name: 'Buis', quantity: 5, unit: 'm' },
      { name: 'Klein materiaal', quantity: 1, kind: 'small-materials', unitPrice: 30, smallMaterialAmount: 30 }
    ]
  )
  assert.equal(remaining.find((item) => item.name === 'Buis')?.quantity, 3)
  assert.equal(remaining.find((item) => item.kind === 'small-materials')?.unitPrice, 15)
})
