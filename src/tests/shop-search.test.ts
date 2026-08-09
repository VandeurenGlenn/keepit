import assert from 'node:assert/strict'
import test from 'node:test'

import { getShopProductBrands, searchShopProducts } from '../server/helpers/shop-search.ts'

const products = [
  {
    name: 'Automatische zekering 20A',
    articleNumber: 'A9F74120',
    manufacturerData: { Merk: 'Schneider Electric' },
    technicalData: { Polen: '1P+N' }
  },
  {
    name: 'Schneider montageplaat',
    articleNumber: 'PLAAT-1'
  },
  {
    name: 'Automatische zekering 16A',
    articleNumber: 'ABB-16',
    manufacturerData: { Manufacturer: 'ABB' }
  }
]

test('shop search matches products by brand metadata', () => {
  const results = searchShopProducts(products, 'schneider')
  assert.deepEqual(
    results.map((product) => product.articleNumber),
    ['A9F74120', 'PLAAT-1']
  )
})

test('shop search combines brand and product attributes', () => {
  const results = searchShopProducts(products, 'schneider 20a')
  assert.deepEqual(
    results.map((product) => product.articleNumber),
    ['A9F74120']
  )
})

test('brand extraction supports Dutch and English metadata labels', () => {
  assert.deepEqual(getShopProductBrands(products[0]), ['Schneider Electric'])
  assert.deepEqual(getShopProductBrands(products[2]), ['ABB'])
})

test('shop search preserves description and technical metadata matches', () => {
  const searchable = [
    {
      name: 'Inbouwmodule',
      description: 'Geschikt voor renovatie',
      technicalData: { Protocol: 'Zigbee' }
    }
  ]

  assert.equal(searchShopProducts(searchable, 'renovatie').length, 1)
  assert.equal(searchShopProducts(searchable, 'zigbee').length, 1)
})

test('shop search matches an explicit catalog source', () => {
  const searchable = [{ name: 'Schakelaar', source: 'niko' }]
  assert.equal(searchShopProducts(searchable, 'niko').length, 1)
})
