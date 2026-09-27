import type { AppSettings } from '../../types/index.js'
import { api } from '../api/client.js'

export type PlaceSearchSettings = {
  countryCode?: string
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
  try {
    settingsRequest ||= api.getAppSettings()
    cachedAppSettings = await settingsRequest
  } catch {
    settingsRequest = undefined
  }
  return {
    language: browser.language,
    countryCode: cachedAppSettings?.addressCountry?.toLowerCase() || browser.countryCode
  }
}
