import { api } from '../api/client.js'
import { WorkLocation } from '../../types/index.js'

const MIN_SEND_DISTANCE_METERS = 100
const MAX_SEND_INTERVAL_MS = 2 * 60 * 1000
const MAX_ACCURACY_METERS = 100

const distanceInMeters = (from: WorkLocation, to: WorkLocation): number => {
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

export class TimelineTracker {
  private watchId?: number
  private lastSent?: WorkLocation
  private sending = false

  start() {
    if (this.watchId !== undefined || !('geolocation' in navigator)) return
    this.watchId = navigator.geolocation.watchPosition(
      (position) => void this.handlePosition(position),
      (error) => console.warn('Timeline location unavailable', error.message),
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 30_000
      }
    )
  }

  stop() {
    if (this.watchId !== undefined) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = undefined
    this.lastSent = undefined
  }

  private async handlePosition(position: GeolocationPosition) {
    const location: WorkLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed ?? undefined,
      capturedAt: position.timestamp
    }
    if ((location.accuracy ?? 0) > MAX_ACCURACY_METERS || this.sending) return
    if (
      this.lastSent &&
      distanceInMeters(this.lastSent, location) < MIN_SEND_DISTANCE_METERS &&
      location.capturedAt - this.lastSent.capturedAt < MAX_SEND_INTERVAL_MS
    ) {
      return
    }

    this.sending = true
    try {
      const result = await api.submitTimelinePosition(location)
      if (result.accepted) this.lastSent = location
      if (result.shouldNotifyCheckout && result.currentJob) {
        await this.showCheckoutNotification(result.currentJob)
      }
      if (result.events?.length) {
        window.dispatchEvent(new CustomEvent('keepit-timeline-events', { detail: result.events }))
      }
    } catch (error) {
      console.warn('Timeline position could not be synced', error)
    } finally {
      this.sending = false
    }
  }

  private async showCheckoutNotification(job: { id: string; name: string }) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const options: NotificationOptions = {
      body: `Je bent vertrokken van ${job.name}, maar je werkregistratie loopt nog.`,
      icon: '/assets/dimac.svg',
      badge: '/assets/dimac.svg',
      tag: `checkout-${job.id}`,
      data: { url: '#!/checkout' }
    }
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification('Nog uitchecken?', options)
      return
    }
    const notification = new Notification('Nog uitchecken?', options)
    notification.onclick = () => {
      location.hash = '#!/checkout'
      window.focus()
    }
  }
}
