import assert from 'node:assert/strict'
import test from 'node:test'
import { dedupeCatalogMaterials } from '../server/helpers/catalog-dedupe.ts'

test('Alelek behoudt varianten met dezelfde naam maar verschillende artikelnummers', () => {
  const result = dedupeCatalogMaterials([
    { name: 'Spot Deep', articleNumber: 'WEV-100-W', productNumber: '100-W', quantity: 1 },
    { name: 'Spot Deep', articleNumber: 'WEV-100-B', productNumber: '100-B', quantity: 1 }
  ])

  assert.equal(result.length, 2)
  assert.deepEqual(result.map((item) => item.articleNumber).sort(), ['WEV-100-B', 'WEV-100-W'])
})

test('Alelek voegt alleen records met dezelfde artikelidentiteit samen', () => {
  const result = dedupeCatalogMaterials([
    { name: 'Spot Deep wit', articleNumber: 'WEV-100-W', quantity: 1, unit: '' },
    { name: 'Spot Deep white', articleNumber: 'WEV-100-W', quantity: 1, unit: 'stuk' }
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].unit, 'stuk')
})
