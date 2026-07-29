import type { LocationVerification, TimelinePlaceCache, TimelinePlaceCacheEntry, WorkLocation } from '../../types/index.js'

export const PLACE_CACHE_RADIUS_METERS = 100
export const PLACE_CONTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const JOB_LOCATION_THRESHOLD_METERS = 250

export const distanceInMeters = (from: WorkLocation, to: WorkLocation): number => {
  const radius = 6_371_000
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(to.latitude - from.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const verifyJobLocation = (
  submittedLocation: WorkLocation | undefined,
  jobLocation: Pick<WorkLocation, 'latitude' | 'longitude'> | undefined
): LocationVerification => {
  if (!submittedLocation || !jobLocation) {
    return { status: 'unavailable', thresholdMeters: JOB_LOCATION_THRESHOLD_METERS }
  }

  const distanceMeters = Math.round(distanceInMeters(submittedLocation, { ...jobLocation, capturedAt: 0 }))
  const accuracyAllowance = Math.max(0, submittedLocation.accuracy || 0)
  const offSite = Math.max(0, distanceMeters - accuracyAllowance) > JOB_LOCATION_THRESHOLD_METERS
  return {
    status: offSite ? 'off-site' : 'on-site',
    distanceMeters,
    thresholdMeters: JOB_LOCATION_THRESHOLD_METERS
  }
}

export const findNearestPlaceCacheEntry = (
  cache: TimelinePlaceCache,
  location: WorkLocation
): { id: string; entry: TimelinePlaceCacheEntry } | undefined => {
  let nearest: { id: string; entry: TimelinePlaceCacheEntry; distance: number } | undefined

  for (const [id, entry] of Object.entries(cache)) {
    const distance = distanceInMeters(entry.location, location)
    if (distance <= PLACE_CACHE_RADIUS_METERS && (!nearest || distance < nearest.distance)) {
      nearest = { id, entry, distance }
    }
  }

  return nearest && { id: nearest.id, entry: nearest.entry }
}

export const hasFreshPlaceContent = (
  entry: TimelinePlaceCacheEntry,
  now = Date.now()
): boolean => Boolean(entry.place && entry.resolvedAt && now - entry.resolvedAt < PLACE_CONTENT_TTL_MS)
