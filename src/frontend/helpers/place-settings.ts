import type { AppSettings } from '../../types/index.js'
import { api } from '../api/client.js'

export type PlaceSearchSettings = {
  countryCode?: string
  restrictedCountryCode?: string
  language: string
}

let cachedAppSettings: AppSettings | undefined
let settingsRequest: Promise<AppSettings> | undefined

const browserSettings = (): PlaceSearchSettings => {
  const language = navigator.languages?.[0] || navigator.language || 'nl-BE'
  let countryCode: string | undefined
  try {
    countryCode = new Intl.Locale(language).maximize().region?.toLowerCase()
  } catch {
    countryCode = language.split(/[-_]/)[1]?.toLowerCase()
  }
  return { countryCode, language }
}

export const setCachedAppSettings = (settings: AppSettings) => {
  cachedAppSettings = settings
  settingsRequest = Promise.resolve(settings)
}

export const getPlaceSearchSettings = async (): Promise<PlaceSearchSettings> => {
  const browser = browserSettings()
  const request = settingsRequest ||= api.getAppSettings()
  try {
    const settings = await request
    if (request === settingsRequest) cachedAppSettings = settings
  } catch {
    if (request === settingsRequest) settingsRequest = undefined
  }
  const restrictedCountryCode = cachedAppSettings?.addressCountry?.toLowerCase()
  return {
    language: browser.language,
    countryCode: restrictedCountryCode || browser.countryCode,
    restrictedCountryCode
  }
}
