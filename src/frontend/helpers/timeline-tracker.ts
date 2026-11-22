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
  private session?: AbortController
  private sending?: AbortSignal
  suggestionsEnabled = true

  start() {
    if (this.watchId !== undefined || !('geolocation' in navigator)) return
    const session = this.session = new AbortController()
    this.watchId = navigator.geolocation.watchPosition(
      (position) => void this.handlePosition(position, session.signal),
      (error) => { if (!session.signal.aborted) console.warn('Timeline location unavailable', error.message) },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 30_000
      }
    )
  }

  stop() {
    this.session?.abort()
    this.session = undefined
    if (this.watchId !== undefined) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = undefined
    this.lastSent = undefined
  }

  private async handlePosition(position: GeolocationPosition, signal: AbortSignal) {
    if (signal.aborted || this.sending === signal) return
    const location: WorkLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed ?? undefined,
      capturedAt: position.timestamp
    }
    if ((location.accuracy ?? 0) > MAX_ACCURACY_METERS) return
    if (
      this.lastSent &&
      distanceInMeters(this.lastSent, location) < MIN_SEND_DISTANCE_METERS &&
      location.capturedAt - this.lastSent.capturedAt < MAX_SEND_INTERVAL_MS
    ) {
      return
    }

    this.sending = signal
    try {
      const result = await api.submitTimelinePosition(location, signal)
      if (signal.aborted) return
      if (result.accepted) this.lastSent = location
      if (result.events?.length) {
        window.dispatchEvent(new CustomEvent('keepit-timeline-events', { detail: result.events }))
      }
      if (result.shouldNotifyCheckout && result.currentJob) {
        const { id, name } = result.currentJob
        await this.showSuggestion(signal, 'Voorstel: werk stoppen?',
          `Je bent vertrokken van ${name}. Keepit heeft niets automatisch gestopt; bevestig zelf je check-out.`,
          `checkout-${id}`, '#!/checkout', 'Check-out bekijken')
      }
      if (result.shouldSuggestCheckin && result.suggestedJob) {
        const { id, name } = result.suggestedJob
        await this.showSuggestion(signal, 'Voorstel: werk starten?',
          `Je lijkt aangekomen bij ${name}. Keepit start niets automatisch; bevestig zelf je check-in.`,
          `checkin-suggestion-${id}`, `#!/checkin?job=${encodeURIComponent(id)}`, 'Check-in bekijken')
      }
      for (const notification of result.movementNotifications || []) {
        await this.showSuggestion(signal, notification.title, notification.message, notification.tag, notification.url || '#!/home', 'Bekijken')
      }
    } catch (error) {
      if (!signal.aborted) console.warn('Timeline position could not be synced', error)
    } finally {
      if (this.sending === signal) this.sending = undefined
    }
  }

  private async showSuggestion(
    session: AbortSignal, title: string, message: string, tag: string, target: string, action: string
  ) {
    const allowed = () => !session.aborted && this.suggestionsEnabled
    if (!allowed()) return
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const registration = await navigator.serviceWorker?.getRegistration()
        if (!allowed()) return
        if (registration?.active) {
          await registration.showNotification(title, {
            body: message, icon: '/assets/dimac.svg', badge: '/assets/dimac.svg', tag, data: { url: target }
          })
          return
        }
        const notification = new Notification(title, { body: message, tag })
        notification.onclick = () => {
          if (!allowed()) return
          location.hash = target
          window.focus()
        }
        return
      } catch {
        // Some browsers allow notifications only through an active service worker.
      }
    }
    if (allowed()) this.showInAppSuggestion(message, action, target, allowed)
  }

  private showInAppSuggestion(message: string, actionLabel: string, target: string, allowed: () => boolean) {
    window.dispatchEvent(
      new CustomEvent('keepit-toast', {
        detail: {
          message,
          actionLabel,
          action: () => {
            if (allowed()) location.hash = target
          }
        }
      })
    )
  }
}
