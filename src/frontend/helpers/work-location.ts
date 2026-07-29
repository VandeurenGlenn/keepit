import { WorkLocation } from '../../types/index.js'

export const captureWorkLocation = async (): Promise<WorkLocation | undefined> => {
  if (!('geolocation' in navigator)) return undefined

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          speed: coords.speed ?? undefined,
          capturedAt: timestamp
        })
      },
      () => resolve(undefined),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60_000
      }
    )
  })
}
