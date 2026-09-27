import { Router } from '@koa/router'
import type { WorkLocation } from '../../types/index.js'
import { reverseGeocodeAddress } from '../helpers/places.js'
import { appSettings } from '../database/database.js'

const router = new Router({ prefix: '/api/places' })

router.post('/reverse', async (ctx) => {
  const body = (ctx.request.body || {}) as Partial<WorkLocation> & { countryCode?: string; language?: string }
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    ctx.status = 400
    ctx.body = { error: 'Invalid location', message: 'De huidige locatie bevat geen geldige coördinaten.' }
    return
  }

  const requestedCountry = String(appSettings.addressCountry || body.countryCode || '').trim().toLowerCase()
  const requestedLanguage = String(body.language || '').trim()
  const place = await reverseGeocodeAddress({
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : undefined,
    capturedAt: Number.isFinite(Number(body.capturedAt)) ? Number(body.capturedAt) : Date.now()
  }, undefined, {
    region: /^[a-z]{2}$/.test(requestedCountry) ? requestedCountry : undefined,
    language: /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(requestedLanguage) ? requestedLanguage : undefined
  })

  if (!place) {
    ctx.status = 502
    ctx.body = {
      error: 'Address unavailable',
      message: 'We konden voor je huidige locatie geen adres vinden. Zoek het adres handmatig.'
    }
    return
  }

  ctx.body = { content: place }
})

export default router.routes()
