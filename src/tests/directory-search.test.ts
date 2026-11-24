import { test } from 'node:test'
import assert from 'node:assert/strict'
import { directorySearch } from '../frontend/helpers/directory-search.ts'

test('directory search matches accents, punctuation and terms across fields', () => {
  const matches = directorySearch('18 cafe Diest')
  assert.equal(matches('Café De Hoek', 'Steenweg 18, Diest'), true)
  assert.equal(matches('Café De Hoek', 'Steenweg 20, Diest'), false)
  assert.equal(directorySearch('robby gmail')('Robby', 'robby@example.gmail'), true)
  assert.equal(directorySearch('  ')(undefined), true)
})
