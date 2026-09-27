import type { Place, WorkLocation } from '../../types/index.js'

export type GoogleGeocodeResponse = {
  status?: string
  results?: Array<{
    place_id?: string
    formatted_address?: string
    address_components?: Array<{ long_name?: string; types?: string[] }>
  }>
}

export const geocodeResponseToPlace = (
  data: GoogleGeocodeResponse,
  location: WorkLocation
): Place | undefined => {
  const result = data.results?.[0]
  if (data.status !== 'OK' || !result?.place_id || !result.formatted_address) return undefined

  const component = (type: string) =>
    result.address_components?.find((entry) => entry.types?.includes(type))?.long_name
  const street = component('route')
  const number = component('street_number')
  const locality = component('locality') || component('postal_town') || component('administrative_area_level_2')

  return {
    id: result.place_id,
    displayName: [street, number].filter(Boolean).join(' ') || locality || result.formatted_address,
    formattedAddress: result.formatted_address,
    location: {
      latitude: location.latitude,
      longitude: location.longitude
    }
  }
}
