import Router from '@koa/router'
import {
  hours,
  jobs,
  timelineLocations,
  timelineLocationsStore,
  timelineTrackingStates,
  timelineTrackingStatesStore,
  users
} from '../database/database.js'
import { distanceInMeters } from '../helpers/geo.js'
import { findNearbyPlace } from '../helpers/places.js'
import { Prestation, TimelineLocationEvent, TimelinePlace, WorkLocation } from '../../types/index.js'

const router = new Router({ prefix: '/api/timeline' })

const MAX_ACCURACY_METERS = 100
const DEPARTURE_METERS = 275
const RETURN_METERS = 150
const ARRIVAL_RADIUS_METERS = 120
const MIN_SIGNIFICANT_TRIP_METERS = 500
const ARRIVAL_DWELL_MS = 5 * 60 * 1000
const RESET_AFTER_MS = 30 * 60 * 1000

const parseLocation = (value: unknown): WorkLocation | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Record<string, unknown>
  const latitude = Number(input.latitude)
  const longitude = Number(input.longitude)
  const accuracy = input.accuracy === undefined ? undefined : Number(input.accuracy)
  const speed = input.speed === undefined || input.speed === null ? undefined : Number(input.speed)
  const capturedAt = Number(input.capturedAt)
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(capturedAt) ||
    (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0)) ||
    (speed !== undefined && !Number.isFinite(speed))
  ) {
    return undefined
  }
  return { latitude, longitude, accuracy, speed, capturedAt }
}

const getActivePrestation = (userId: string, jobId?: string): Prestation | undefined => {
  if (!jobId) return undefined
  const ids = jobs[jobId]?.hours?.[userId] || []
  const prestation = ids.length ? hours[userId]?.[ids[ids.length - 1]] : undefined
  return prestation && !prestation.checkout ? prestation : undefined
}

const createEvent = (
  userId: string,
  type: TimelineLocationEvent['type'],
  location: WorkLocation,
  options: { jobId?: string; place?: TimelinePlace } = {}
): TimelineLocationEvent => {
  const event: TimelineLocationEvent = {
    id: crypto.randomUUID(),
    type,
    occurredAt: location.capturedAt,
    location,
    ...options
  }
  ;(timelineLocations[userId] ||= []).push(event)
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
  timelineLocations[userId] = timelineLocations[userId].filter((item) => item.occurredAt >= cutoff)
  return event
}

router.get('/me', async (ctx) => {
  const userId = ctx.state.userid
  const days = Math.min(90, Math.max(1, Number(ctx.query.days) || 30))
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  ctx.body = (timelineLocations[userId] || [])
    .filter((event) => event.occurredAt >= since)
    .sort((a, b) => b.occurredAt - a.occurredAt)
})

router.post('/position', async (ctx) => {
  const userId = ctx.state.userid
  const user = users[userId]
  if (!user?.preferences?.continuousTimelineLocation) {
    ctx.status = 403
    ctx.body = { error: 'Continuous timeline tracking is not enabled' }
    return
  }

  const location = parseLocation(ctx.request.body?.location)
  if (!location) {
    ctx.status = 400
    ctx.body = { error: 'Invalid location' }
    return
  }
  if ((location.accuracy ?? 0) > MAX_ACCURACY_METERS) {
    ctx.body = { accepted: false, reason: 'low_accuracy' }
    return
  }

  let state = (timelineTrackingStates[userId] ||= {})
  const gap = state.lastPosition ? location.capturedAt - state.lastPosition.capturedAt : 0
  if (gap > RESET_AFTER_MS) {
    state = timelineTrackingStates[userId] = {}
  }

  const activeJobId = user.currentJob
  if (!state.lastPosition && !activeJobId) {
    state.lastPosition = location
    state.lastPlaceLocation = location
    await timelineTrackingStatesStore.put(timelineTrackingStates)
    ctx.body = { accepted: true, events: [], shouldNotifyCheckout: false }
    return
  }

  const activePrestation = getActivePrestation(userId, activeJobId)
  const activeJobStartedAt = activePrestation?.checkin
  const activeJobLocation =
    activePrestation?.checkinLocation ||
    (state.activeJobId === activeJobId ? state.activeJobLocation : undefined) ||
    location
  const createdEvents: TimelineLocationEvent[] = []

  if (
    activeJobId &&
    activeJobLocation &&
    (state.activeJobId !== activeJobId || state.activeJobStartedAt !== activeJobStartedAt)
  ) {
    state.activeJobId = activeJobId
    state.activeJobStartedAt = activeJobStartedAt
    state.activeJobLocation = activeJobLocation
    state.departedJobId = undefined
    state.outsideSamples = 0
    state.anchor = {
      location: activeJobLocation,
      arrivedAt: activeJobLocation.capturedAt,
      jobId: activeJobId,
      place: { name: jobs[activeJobId]?.name || 'Werf' }
    }
    state.lastPlaceLocation = activeJobLocation
    state.candidate = undefined
  } else if (!activeJobId) {
    state.activeJobId = undefined
    state.activeJobStartedAt = undefined
    state.activeJobLocation = undefined
    state.departedJobId = undefined
  }

  if (activeJobId && activeJobLocation) {
    const distanceFromJob = distanceInMeters(activeJobLocation, location)
    if (state.departedJobId === activeJobId && distanceFromJob <= RETURN_METERS) {
      const event = createEvent(userId, 'return', location, {
        jobId: activeJobId,
        place: { name: jobs[activeJobId]?.name || 'Werf' }
      })
      createdEvents.push(event)
      state.departedJobId = undefined
      state.outsideSamples = 0
      state.anchor = {
        location: activeJobLocation,
        arrivedAt: location.capturedAt,
        jobId: activeJobId,
        place: event.place
      }
      state.lastPlaceLocation = activeJobLocation
      state.candidate = undefined
    } else if (!state.departedJobId) {
      state.outsideSamples = distanceFromJob > DEPARTURE_METERS ? (state.outsideSamples || 0) + 1 : 0
      if ((state.outsideSamples || 0) >= 2) {
        const event = createEvent(userId, 'departure', location, {
          jobId: activeJobId,
          place: { name: jobs[activeJobId]?.name || 'Werf' }
        })
        createdEvents.push(event)
        state.departedJobId = activeJobId
        state.lastPlaceLocation = activeJobLocation
        state.anchor = undefined
        state.candidate = { location, startedAt: location.capturedAt }
        state.outsideSamples = 0
      }
    }
  }

  if (!state.anchor && (!activeJobId || state.departedJobId === activeJobId)) {
    if (!state.candidate) {
      state.candidate = { location, startedAt: location.capturedAt }
    } else if (distanceInMeters(state.candidate.location, location) > ARRIVAL_RADIUS_METERS) {
      state.candidate = { location, startedAt: location.capturedAt }
    } else {
      const dwellTime = location.capturedAt - state.candidate.startedAt
      const tripDistance = state.lastPlaceLocation
        ? distanceInMeters(state.lastPlaceLocation, state.candidate.location)
        : Number.POSITIVE_INFINITY
      if (dwellTime >= ARRIVAL_DWELL_MS && tripDistance >= MIN_SIGNIFICANT_TRIP_METERS) {
        const place = (await findNearbyPlace(state.candidate.location)) || { name: 'Onbekende stop' }
        const event = createEvent(userId, 'arrival', state.candidate.location, { place })
        createdEvents.push(event)
        state.anchor = {
          location: state.candidate.location,
          arrivedAt: state.candidate.startedAt,
          place
        }
        state.lastPlaceLocation = state.candidate.location
        state.candidate = undefined
      }
    }
  } else if (state.anchor && !state.anchor.jobId) {
    const distanceFromAnchor = distanceInMeters(state.anchor.location, location)
    state.outsideSamples = distanceFromAnchor > DEPARTURE_METERS ? (state.outsideSamples || 0) + 1 : 0
    if ((state.outsideSamples || 0) >= 2) {
      const event = createEvent(userId, 'departure', location, { place: state.anchor.place })
      createdEvents.push(event)
      state.lastPlaceLocation = state.anchor.location
      state.anchor = undefined
      state.candidate = { location, startedAt: location.capturedAt }
      state.outsideSamples = 0
    }
  }

  state.lastPosition = location
  await Promise.all([
    timelineTrackingStatesStore.put(timelineTrackingStates),
    createdEvents.length ? timelineLocationsStore.put(timelineLocations) : Promise.resolve()
  ])

  const jobDeparture = createdEvents.find(
    (event) => event.type === 'departure' && event.jobId === activeJobId && user.currentJob === activeJobId
  )
  ctx.body = {
    accepted: true,
    events: createdEvents,
    shouldNotifyCheckout: Boolean(jobDeparture),
    currentJob: activeJobId ? { id: activeJobId, name: jobs[activeJobId]?.name || 'de werf' } : undefined
  }
})

router.delete('/me', async (ctx) => {
  const userId = ctx.state.userid
  delete timelineLocations[userId]
  delete timelineTrackingStates[userId]
  await Promise.all([
    timelineLocationsStore.put(timelineLocations),
    timelineTrackingStatesStore.put(timelineTrackingStates)
  ])
  ctx.status = 204
})

export default router.routes()
