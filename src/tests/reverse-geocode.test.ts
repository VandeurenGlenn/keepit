import { test } from 'node:test'
import assert from 'node:assert'
// @ts-ignore -- Node's test runner executes TypeScript source directly.
import { geocodeResponseToPlace } from '../server/helpers/reverse-geocode.ts'

test('reverse geocoding creates a selectable Belgian work address', () => {
  const location = { latitude: 50.9944, longitude: 4.4842, accuracy: 12, capturedAt: Date.now() }
  const place = geocodeResponseToPlace({
    status: 'OK',
    results: [{
      place_id: 'place-mechelen-147',
      formatted_address: 'Mechelsesteenweg 147, 1933 Zaventem, België',
      address_components: [
        { long_name: 'Mechelsesteenweg', types: ['route'] },
        { long_name: '147', types: ['street_number'] },
        { long_name: 'Zaventem', types: ['locality'] }
      ]
    }]
  }, location)

  assert.deepStrictEqual(place, {
    id: 'place-mechelen-147',
    displayName: 'Mechelsesteenweg 147',
    formattedAddress: 'Mechelsesteenweg 147, 1933 Zaventem, België',
    location: { latitude: location.latitude, longitude: location.longitude }
  })
})

test('reverse geocoding rejects incomplete Google responses', () => {
  const location = { latitude: 50.9944, longitude: 4.4842 }
  assert.strictEqual(geocodeResponseToPlace({ status: 'ZERO_RESULTS', results: [] }, location), undefined)
  assert.strictEqual(
    geocodeResponseToPlace({ status: 'OK', results: [{ formatted_address: 'Onbekend' }] }, location),
    undefined
  )
})
