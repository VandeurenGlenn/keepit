import { test } from 'node:test'
import assert from 'node:assert'
// Node's built-in TypeScript test runner executes the source file directly.
// @ts-ignore -- Node requires the source extension here; tests are excluded from the production build.
import {
  distanceInMeters,
  findNearestPlaceCacheEntry,
  hasFreshPlaceContent,
  PLACE_CONTENT_TTL_MS,
  verifyJobLocation
} from '../server/helpers/geo.ts'

const location = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
  capturedAt: Date.now()
})

test('significant location distance calculation', async (t) => {
  await t.test('treats identical coordinates as no movement', () => {
    const point = location(51.2194, 4.4025)
    assert.strictEqual(distanceInMeters(point, point), 0)
  })

  await t.test('distinguishes local GPS noise from a meaningful trip', () => {
    const antwerp = location(51.2194, 4.4025)
    const nearby = location(51.2200, 4.4025)
    const store = location(51.2284, 4.4025)

    assert.ok(distanceInMeters(antwerp, nearby) < 100)
    assert.ok(distanceInMeters(antwerp, store) > 500)
  })
})

test('significant place cache', async (t) => {
  const now = Date.now()
  const cache = {
    known: {
      location: location(51.2194, 4.4025),
      placeId: 'place-1',
      place: { id: 'place-1', name: 'Bekende winkel' },
      resolvedAt: now,
      lastUsedAt: now
    }
  }

  await t.test('reuses the nearest place inside 100 metres', () => {
    const match = findNearestPlaceCacheEntry(cache, location(51.2198, 4.4025))
    assert.strictEqual(match?.id, 'known')
  })

  await t.test('does not reuse a place outside 100 metres', () => {
    const match = findNearestPlaceCacheEntry(cache, location(51.221, 4.4025))
    assert.strictEqual(match, undefined)
  })

  await t.test('expires Google place content after 30 days', () => {
    assert.strictEqual(hasFreshPlaceContent(cache.known, now + PLACE_CONTENT_TTL_MS - 1), true)
    assert.strictEqual(hasFreshPlaceContent(cache.known, now + PLACE_CONTENT_TTL_MS), false)
  })
})

test('job location verification', async (t) => {
  const job = location(51.2194, 4.4025)

  await t.test('accepts a check-in near the job', () => {
    assert.strictEqual(verifyJobLocation(location(51.22, 4.4025), job).status, 'on-site')
  })

  await t.test('flags a check-in far from the job', () => {
    const result = verifyJobLocation(location(51.2284, 4.4025), job)
    assert.strictEqual(result.status, 'off-site')
    assert.ok((result.distanceMeters || 0) > 500)
  })

  await t.test('accounts for reported GPS accuracy', () => {
    const imprecise = { ...location(51.223, 4.4025), accuracy: 200 }
    assert.strictEqual(verifyJobLocation(imprecise, job).status, 'on-site')
  })

  await t.test('marks missing coordinates as unavailable', () => {
    assert.strictEqual(verifyJobLocation(undefined, job).status, 'unavailable')
  })
})
