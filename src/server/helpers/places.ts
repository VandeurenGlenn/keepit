import { config } from './config.js'
import { TimelinePlace, WorkLocation } from '../../types/index.js'
import { readFile } from 'fs/promises'
import { timelinePlaceCache, timelinePlaceCacheStore } from '../database/database.js'
import { findNearestPlaceCacheEntry, hasFreshPlaceContent } from './geo.js'

let frontendApiKey: string | undefined

const getApiKey = async (): Promise<string | undefined> => {
  const configuredKey = process.env.KEEPIT_GOOGLE_PLACES_API_KEY || config.google?.placesApiKey
  if (configuredKey) return configuredKey
  if (frontendApiKey) return frontendApiKey

  try {
    const html = await readFile('./www/index.html', 'utf8')
    frontendApiKey = html.match(/\bkey\s*:\s*['"]([^'"]+)['"]/)?.[1]
    return frontendApiKey
  } catch {
    return undefined
  }
}

const reverseGeocode = async (
  location: WorkLocation,
  apiKey: string
): Promise<TimelinePlace | undefined> => {
  try {
    const params = new URLSearchParams({
      latlng: `${location.latitude},${location.longitude}`,
      key: apiKey,
      language: 'nl',
      region: 'be'
    })
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`)
    if (!response.ok) {
      console.warn(`Reverse geocoding failed with ${response.status}`)
      return undefined
    }
    const data = (await response.json()) as {
      status?: string
      results?: Array<{
        place_id?: string
        formatted_address?: string
        address_components?: Array<{ long_name?: string; types?: string[] }>
      }>
    }
    const result = data.results?.[0]
    if (data.status !== 'OK' || !result?.formatted_address) return undefined
    const component = (type: string) =>
      result.address_components?.find((entry) => entry.types?.includes(type))?.long_name
    const street = component('route')
    const number = component('street_number')
    const locality = component('locality') || component('postal_town') || component('administrative_area_level_2')
    const name = [street, number].filter(Boolean).join(' ') || locality || result.formatted_address
    return {
      id: result.place_id,
      name,
      formattedAddress: result.formatted_address,
      primaryType: 'address'
    }
  } catch (error) {
    console.warn('Reverse geocoding failed', error)
    return undefined
  }
}

export const findNearbyPlace = async (location: WorkLocation): Promise<TimelinePlace | undefined> => {
  const now = Date.now()
  const cached = findNearestPlaceCacheEntry(timelinePlaceCache, location)
  if (cached && hasFreshPlaceContent(cached.entry, now)) {
    cached.entry.lastUsedAt = now
    return cached.entry.place
  }
  const removedExpiredContent = Boolean(cached?.entry.place)
  if (cached?.entry.place) {
    delete cached.entry.place
    delete cached.entry.resolvedAt
  }

  const apiKey = await getApiKey()
  if (!apiKey) {
    if (removedExpiredContent) await timelinePlaceCacheStore.put(timelinePlaceCache)
    return undefined
  }

  let place: TimelinePlace | undefined
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.primaryType'
      },
      body: JSON.stringify({
        maxResultCount: 1,
        rankPreference: 'DISTANCE',
        languageCode: 'nl',
        regionCode: 'BE',
        locationRestriction: {
          circle: {
            center: {
              latitude: location.latitude,
              longitude: location.longitude
            },
            radius: 120
          }
        }
      })
    })
    if (response.ok) {
      const data = (await response.json()) as {
        places?: Array<{
          id?: string
          displayName?: { text?: string }
          formattedAddress?: string
          primaryType?: string
        }>
      }
      const result = data.places?.[0]
      if (result?.displayName?.text) {
        place = {
          id: result.id,
          name: result.displayName.text,
          formattedAddress: result.formattedAddress,
          primaryType: result.primaryType
        }
      }
    } else {
      console.warn(`Places nearby search failed with ${response.status}`)
    }
  } catch (error) {
    console.warn('Places nearby search failed', error)
  }

  place ||= await reverseGeocode(location, apiKey)
  if (!place) {
    if (removedExpiredContent) await timelinePlaceCacheStore.put(timelinePlaceCache)
    return undefined
  }

  const cacheEntry = cached?.entry || { location, lastUsedAt: now }
  cacheEntry.location = location
  cacheEntry.placeId = place.id || cacheEntry.placeId
  cacheEntry.place = place
  cacheEntry.resolvedAt = now
  cacheEntry.lastUsedAt = now
  timelinePlaceCache[cached?.id || crypto.randomUUID()] = cacheEntry
  await timelinePlaceCacheStore.put(timelinePlaceCache)
  return place
}

export const findPlaceLocation = async (
  placeId: string
): Promise<Pick<WorkLocation, 'latitude' | 'longitude'> | undefined> => {
  const apiKey = await getApiKey()
  if (!apiKey || !placeId) return undefined

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'location'
      }
    })
    if (!response.ok) {
      console.warn(`Place details lookup failed with ${response.status}`)
      return undefined
    }
    const data = (await response.json()) as { location?: { latitude?: number; longitude?: number } }
    const latitude = Number(data.location?.latitude)
    const longitude = Number(data.location?.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
    return { latitude, longitude }
  } catch (error) {
    console.warn('Place details lookup failed', error)
    return undefined
  }
}
