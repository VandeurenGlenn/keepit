import { Router } from '@koa/router'
import { jobs, jobsStore, hours, hoursStore, users, usersStore } from './../database/database.js'
import { Prestation, WorkLocation } from '../../types/index.js'
import { verifyJobLocation } from '../helpers/geo.js'
import { findNearbyPlace, findPlaceLocation } from '../helpers/places.js'
import { findOpenPrestationId } from '../helpers/work-sessions.js'

const router = new Router({
  prefix: '/api/hours'
})

type CheckinBody = {
  job?: string
  checkin?: number | string
  location?: WorkLocation
  source?: Prestation['source']
  clientRequestId?: string
}

type CheckoutBody = {
  job?: string
  checkout?: number | string
  location?: WorkLocation
  prestationId?: string
  clientRequestId?: string
}

const allowedSources: NonNullable<Prestation['source']>[] = ['manual', 'offline-sync', 'admin']

const getOpenPrestationId = (userId: string, jobId: string): string | undefined => {
  return findOpenPrestationId(
    users[userId]?.currentPrestationId,
    jobId,
    jobs[jobId]?.hours?.[userId] || [],
    hours[userId] || {}
  )
}

const toLocation = (value: WorkLocation | undefined): WorkLocation | undefined => {
  if (!value) return undefined
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  const accuracy = value.accuracy === undefined ? undefined : Number(value.accuracy)
  const capturedAt = Number(value.capturedAt)
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(capturedAt) ||
    (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0))
  ) {
    return undefined
  }
  return { latitude, longitude, accuracy, capturedAt }
}

const toTimestamp = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
    const dateParsed = new Date(value).getTime()
    if (!Number.isNaN(dateParsed)) return dateParsed
  }
  return Number.NaN
}

const getJobLocation = async (
  jobId: string
): Promise<Pick<WorkLocation, 'latitude' | 'longitude'> | undefined> => {
  const place = jobs[jobId]?.place
  const latitude = Number(place?.location?.latitude)
  const longitude = Number(place?.location?.longitude)
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude }
  if (!place?.id) return undefined

  const resolved = await findPlaceLocation(place.id)
  if (resolved) place.location = resolved
  return resolved
}

const prestationForRoles = (prestation: Prestation, roles: string[] = []): Prestation => {
  if (roles.includes('admin')) return prestation
  const { checkinLocationVerification, checkoutLocationVerification, ...visiblePrestation } = prestation
  return visiblePrestation
}

router.get('/job/:id', async (ctx) => {
  const jobId = ctx.params.id
  const billableOnly = `${ctx.query.billableOnly || ''}`.toLowerCase() === 'true'
  if (!jobId || !jobs[jobId]) {
    ctx.status = 404

    ctx.body = { error: 'Job not found' }
    return
  }
  const job = jobs[jobId]
  const jobHoursByUser = job.hours || {}
  const jobHours: { [userId: string]: Prestation[] } = {}
  for (const [userId, prestationIds] of Object.entries(jobHoursByUser)) {
    const userHours = hours[userId] || {}
    jobHours[userId] = prestationIds
      .map((id) => userHours[id] ? ({ id, ...userHours[id] }) : undefined)
      .filter((prestation): prestation is Prestation & { id: string } => {
        if (!prestation) return false
        if (!billableOnly) return true
        const hasCheckout = typeof prestation.checkout === 'number' && Number.isFinite(prestation.checkout)
        const notInvoiced = !prestation.invoiceId && !prestation.invoicedAt
        return hasCheckout && notInvoiced
      })
      .map((prestation) => prestationForRoles(prestation, users[ctx.state.userid]?.roles))
  }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
  ctx.body = jobHours
  return
})

router.patch('/job/:jobId/:userId/:prestationId', async (ctx) => {
  const actor = users[ctx.state.userid]
  if (!actor?.roles?.includes('admin')) {
    ctx.status = 403
    ctx.body = { error: 'Alleen admins kunnen uren corrigeren.' }
    return
  }
  const { jobId, userId, prestationId } = ctx.params
  const prestation = hours[userId]?.[prestationId]
  if (!jobs[jobId] || !prestation || !jobs[jobId].hours?.[userId]?.includes(prestationId)) {
    ctx.status = 404
    ctx.body = { error: 'Urenregistratie niet gevonden.' }
    return
  }
  if (prestation.invoiceId || prestation.invoicedAt) {
    ctx.status = 409
    ctx.body = { error: 'Gefactureerde uren kunnen niet meer gewijzigd worden.' }
    return
  }
  const body = (ctx.request.body || {}) as { checkin?: number | string; checkout?: number | string; reason?: string }
  const checkin = toTimestamp(body.checkin)
  const checkout = body.checkout === undefined || body.checkout === '' ? undefined : toTimestamp(body.checkout)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!Number.isFinite(checkin) || (checkout !== undefined && (!Number.isFinite(checkout) || checkout < checkin))) {
    ctx.status = 400
    ctx.body = { error: 'Controleer de begin- en eindtijd.' }
    return
  }
  if (reason.length < 3 || reason.length > 500) {
    ctx.status = 400
    ctx.body = { error: 'Geef een reden van minstens 3 en maximaal 500 tekens.' }
    return
  }
  const before = { checkin: prestation.checkin, checkout: prestation.checkout }
  prestation.checkin = checkin
  prestation.checkout = checkout
  prestation.duration = checkout === undefined ? 0 : checkout - checkin
  prestation.source = 'admin'
  prestation.corrections = [...(prestation.corrections || []), {
    id: crypto.randomUUID(), actorId: ctx.state.userid, correctedAt: new Date().toISOString(), reason,
    before, after: { checkin, checkout }
  }]
  jobs[jobId].updatedAt = new Date().toISOString()
  await Promise.all([hoursStore.put(hours), jobsStore.put(jobs)])
  ctx.body = { id: prestationId, ...prestation }
})

router.get('/me', async (ctx) => {
  const userId = ctx.state.userid
  const days = Math.min(90, Math.max(1, Number(ctx.query.days) || 14))
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const prestations = Object.entries(hours[userId] || {})
    .map(([id, prestation]) => ({ id, ...prestation }))
    .filter((prestation) => toTimestamp(prestation.checkin) >= since)
    .sort((a, b) => toTimestamp(b.checkin) - toTimestamp(a.checkin))

  const jobLocations = new Map<string, Pick<WorkLocation, 'latitude' | 'longitude'> | undefined>()
  await Promise.all(
    Array.from(new Set(prestations.map((prestation) => prestation.jobId).filter(Boolean))).map(async (jobId) => {
      jobLocations.set(jobId!, await getJobLocation(jobId!))
    })
  )
  let verificationAdded = false
  let placeAdded = false
  let placeLookups = 0
  for (const prestation of prestations) {
    const stored = hours[userId]?.[prestation.id]
    if (!stored || !prestation.jobId) continue
    const jobLocation = jobLocations.get(prestation.jobId)
    if (!stored.checkinLocationVerification) {
      stored.checkinLocationVerification = verifyJobLocation(stored.checkinLocation, jobLocation)
      prestation.checkinLocationVerification = stored.checkinLocationVerification
      verificationAdded = true
    }
    if (stored.checkout && !stored.checkoutLocationVerification) {
      stored.checkoutLocationVerification = verifyJobLocation(stored.checkoutLocation, jobLocation)
      prestation.checkoutLocationVerification = stored.checkoutLocationVerification
      verificationAdded = true
    }
    if (stored.checkinLocation && !stored.checkinPlace && placeLookups < 12) {
      placeLookups += 1
      stored.checkinPlace = await findNearbyPlace(stored.checkinLocation)
      prestation.checkinPlace = stored.checkinPlace
      placeAdded ||= Boolean(stored.checkinPlace)
    }
    if (stored.checkoutLocation && !stored.checkoutPlace && placeLookups < 12) {
      placeLookups += 1
      stored.checkoutPlace = await findNearbyPlace(stored.checkoutLocation)
      prestation.checkoutPlace = stored.checkoutPlace
      placeAdded ||= Boolean(stored.checkoutPlace)
    }
  }
  if (verificationAdded || placeAdded) await Promise.all([hoursStore.put(hours), jobsStore.put(jobs)])

  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
  ctx.body = prestations.map((prestation) => ({
    id: prestation.id,
    ...prestationForRoles(prestation, users[userId]?.roles)
  }))
})

router.post('/checkin', async (ctx) => {
  const body = (ctx.request.body || {}) as CheckinBody
  const { job, checkin } = body
  const userId = ctx.state.userid
  if (!job) {
    ctx.status = 400
    ctx.body = { error: 'job is required' }
    return
  }
  if (!users[userId]) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }
  if (jobs[job].status === 'completed' || jobs[job].archivedAt) {
    ctx.status = 409
    ctx.body = { error: 'Deze job is niet meer actief.' }
    return
  }
  const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId.slice(0, 120) : undefined
  if (clientRequestId) {
    const existing = Object.entries(hours[userId] || {}).find(([, item]) => item.clientRequestId === clientRequestId)
    if (existing) {
      ctx.body = { id: existing[0], ...prestationForRoles(existing[1], users[userId]?.roles) }
      return
    }
  }
  if (users[userId].currentJob) {
    ctx.status = 400
    ctx.body = {
      error: 'You need to checkout first.',
      currentJob: users[userId].currentJob,
      steps: ['checkout other job', 'checkin new job']
    }
    return
  }

  const checkinTs = toTimestamp(checkin)
  if (Number.isNaN(checkinTs)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid checkin value' }
    return
  }

  const prestationId = crypto.randomUUID()
  const checkinLocation = toLocation(body.location)
  const [checkinPlace, jobLocation] = await Promise.all([
    checkinLocation ? findNearbyPlace(checkinLocation) : Promise.resolve(undefined),
    getJobLocation(job)
  ])
  const prestation: Prestation = {
    description: '',
    duration: 0,
    checkin: checkinTs,
    serverCheckin: Date.now(),
    source: allowedSources.includes(body.source as NonNullable<Prestation['source']>) ? body.source : 'manual',
    clientRequestId,
    jobId: job,
    checkinLocation,
    checkinPlace,
    checkinLocationVerification: verifyJobLocation(checkinLocation, jobLocation)
  }

  if (!hours[userId]) {
    hours[userId] = { [prestationId]: prestation }
  } else {
    hours[userId][prestationId] = prestation
  }

  users[userId].currentJob = job
  users[userId].currentPrestationId = prestationId

  jobs[job].hours = jobs[job].hours || {}
  jobs[job].hours[userId] = jobs[job].hours[userId] || []
  jobs[job].hours[userId].push(prestationId)

  try {
    await Promise.all([jobsStore.put(jobs), hoursStore.put(hours), usersStore.put(users)])
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
    ctx.body = { id: prestationId, ...prestationForRoles(prestation, users[userId]?.roles) }
    return
  } catch (err) {
    console.error('failed to persist checkin', err)
    ctx.status = 500
    ctx.body = { error: 'failed to persist checkin' }
    return
  }
})

router.post('/checkout', async (ctx) => {
  const body = (ctx.request.body || {}) as CheckoutBody
  const { job, checkout } = body
  const userId = ctx.state.userid
  const checkoutClientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId.slice(0, 120) : undefined
  if (checkoutClientRequestId) {
    const existing = Object.entries(hours[userId] || {}).find(([, item]) => item.checkoutClientRequestId === checkoutClientRequestId)
    if (existing) { ctx.body = { id: existing[0], ...prestationForRoles(existing[1], users[userId]?.roles) }; return }
  }
  if (!job) {
    ctx.status = 400
    ctx.body = { error: 'job is required' }
    return
  }
  if (!users[userId]) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }
  if (!jobs[job]) {
    ctx.status = 404
    ctx.body = { error: 'Job not found' }
    return
  }

  if (users[userId].currentJob !== job) {
    ctx.status = 400
    ctx.body = { error: 'User is not currently working on this job' }
    return
  }

  jobs[job].updatedAt = new Date().toISOString()

  const prestations = jobs[job].hours?.[userId]
  if (!prestations || prestations.length === 0) {
    ctx.status = 404
    ctx.body = { error: 'Prestations not found' }
    return
  }

  const requestedPrestationId = typeof body.prestationId === 'string' ? body.prestationId : undefined
  const prestationId = requestedPrestationId || getOpenPrestationId(userId, job)

  if (!prestationId || !prestations.includes(prestationId)) {
    ctx.status = 404
    ctx.body = { error: 'Active prestation not found' }
    return
  }

  const prestation = hours[userId]?.[prestationId]
  if (!prestation) {
    ctx.status = 404
    ctx.body = { error: 'Prestation not found' }
    return
  }

  if (prestation.checkout) {
    ctx.status = 400
    ctx.body = { error: 'This prestation is already checked out' }
    return
  }

  const checkoutTs = toTimestamp(checkout)
  if (Number.isNaN(checkoutTs)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid checkout value' }
    return
  }

  const checkinTs = toTimestamp(prestation.checkin)
  if (!Number.isNaN(checkinTs) && checkoutTs < checkinTs) {
    ctx.status = 400
    ctx.body = { error: 'Checkout cannot be before check-in' }
    return
  }

  prestation.checkout = checkoutTs
  prestation.serverCheckout = Date.now()
  prestation.checkoutClientRequestId = checkoutClientRequestId
  prestation.checkoutLocation = toLocation(body.location)
  const [checkoutPlace, jobLocation] = await Promise.all([
    prestation.checkoutLocation ? findNearbyPlace(prestation.checkoutLocation) : Promise.resolve(undefined),
    getJobLocation(job)
  ])
  prestation.checkoutPlace = checkoutPlace
  prestation.checkoutLocationVerification = verifyJobLocation(prestation.checkoutLocation, jobLocation)
  if (!Number.isNaN(checkinTs)) {
    prestation.duration = Math.max(0, checkoutTs - checkinTs)
  }

  users[userId].currentJob = undefined
  users[userId].currentPrestationId = undefined

  try {
    const promises: Promise<unknown>[] = [jobsStore.put(jobs), hoursStore.put(hours), usersStore.put(users)]
    await Promise.all(promises)
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
    ctx.body = { id: prestationId, ...prestationForRoles(prestation, users[userId]?.roles) }
    return
  } catch (err) {
    console.error('failed to persist checkout', err)
    ctx.status = 500
    ctx.body = { error: 'failed to persist checkout' }
    return
  }
})

export default router.routes()
