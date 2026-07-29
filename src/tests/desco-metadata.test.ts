import { test } from 'node:test'
import assert from 'node:assert/strict'
// Node's built-in TypeScript test runner executes the source file directly.
// @ts-ignore -- production imports use the emitted .js extension.
import { mergeDescoMetadataItems } from '../server/helpers/desco-metadata.ts'

test('Desco metadata survives an image-less Excel sync', () => {
  const merged = mergeDescoMetadataItems(
    [
      {
        name: 'RK ELLEBOOG 90° MF 28MM',
        quantity: 1,
        articleNumber: '10095',
        productNumber: 'RR5001028028000',
        unitPrice: 7.01
      }
    ],
    [
      {
        name: 'Older product title',
        articleNumber: '10095',
        description: 'Koper soldeerfitting voor installatiewater.',
        image: '/cache/desco/product.jpg',
        technicalData: { merk: 'Comap' },
        manufacturerData: { Productnaam: 'Official product' },
        dataSources: [
          {
            provider: 'Manufacturer',
            pageUrl: 'https://manufacturer.example/product/1',
            productNumber: 'RR5001028028000',
            fetchedAt: '2026-07-27T10:00:00.000Z'
          }
        ],
        enrichedAt: '2026-05-15T17:48:02.188Z'
      }
    ],
    '2026-07-28T00:00:00.000Z'
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0].image, '/cache/desco/product.jpg')
  assert.equal(merged[0].description, 'Koper soldeerfitting voor installatiewater.')
  assert.deepEqual(merged[0].technicalData, { merk: 'Comap' })
  assert.deepEqual(merged[0].manufacturerData, { Productnaam: 'Official product' })
  assert.equal(merged[0].dataSources?.[0].provider, 'Manufacturer')
  assert.equal(merged[0].name, 'RK ELLEBOOG 90° MF 28MM')
  assert.equal(merged[0].enrichedAt, '2026-05-15T17:48:02.188Z')
})

test('fresh valid Desco metadata wins over cached metadata', () => {
  const merged = mergeDescoMetadataItems(
    [
      {
        name: 'Product',
        quantity: 1,
        articleNumber: '42',
        description: 'Nieuwe en volledige productbeschrijving.',
        image: 'https://cdn.example.test/new.jpg'
      }
    ],
    [
      {
        name: 'Product',
        articleNumber: '42',
        description: 'Oude maar geldige productbeschrijving.',
        image: '/cache/desco/old.jpg'
      }
    ]
  )

  assert.equal(merged[0].description, 'Nieuwe en volledige productbeschrijving.')
  assert.equal(merged[0].image, 'https://cdn.example.test/new.jpg')
})
