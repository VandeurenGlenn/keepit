import { mkdir, readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { MaterialLine } from '../../types/index.js'

export type StoredMaterial = {
  name: string
  articleNumber?: string
  productNumber?: string
  unit?: string
  unitPrice?: number
  packagingQuantity?: number
  timestamp?: number
  usageCount?: number
}

type MaterialPreferences = {
  favorites: StoredMaterial[]
  history: StoredMaterial[]
}

const preferencesPath = resolve('.database', 'material-preferences.json')
const MAX_HISTORY = 20

export const ensureStorageDir = async (): Promise<void> => {
  try {
    await mkdir(resolve('.database'), { recursive: true })
  } catch {
    // Directory already exists
  }
}

export const readPreferences = async (): Promise<MaterialPreferences> => {
  try {
    const raw = await readFile(preferencesPath, 'utf8')
    return JSON.parse(raw) as MaterialPreferences
  } catch {
    return { favorites: [], history: [] }
  }
}

export const writePreferences = async (prefs: MaterialPreferences): Promise<void> => {
  await ensureStorageDir()
  await writeFile(preferencesPath, JSON.stringify(prefs, null, 2))
}

export const addToHistory = async (material: MaterialLine): Promise<void> => {
  const prefs = await readPreferences()

  const item: StoredMaterial = {
    name: material.name,
    articleNumber: material.articleNumber,
    productNumber: material.productNumber,
    unit: material.unit,
    unitPrice: material.unitPrice,
    packagingQuantity: material.packagingQuantity,
    timestamp: Date.now(),
    usageCount: (prefs.history.find((entry) => entry.name === material.name)?.usageCount || 0) + 1
  }

  // Remove if already exists, then add to front
  const filtered = prefs.history.filter((m) => m.name !== material.name)
  prefs.history = [item, ...filtered].slice(0, MAX_HISTORY)

  await writePreferences(prefs)
}

export const addToFavorites = async (material: MaterialLine): Promise<void> => {
  const prefs = await readPreferences()

  const exists = prefs.favorites.some((m) => m.name === material.name)
  if (!exists) {
    prefs.favorites.push({
      name: material.name,
      articleNumber: material.articleNumber,
      productNumber: material.productNumber,
      unit: material.unit,
      unitPrice: material.unitPrice,
      packagingQuantity: material.packagingQuantity
    })
    await writePreferences(prefs)
  }
}

export const removeFromFavorites = async (name: string): Promise<void> => {
  const prefs = await readPreferences()
  prefs.favorites = prefs.favorites.filter((m) => m.name !== name)
  await writePreferences(prefs)
}

export const getFavorites = async (): Promise<StoredMaterial[]> => {
  const prefs = await readPreferences()
  return prefs.favorites
}

export const getHistory = async (): Promise<StoredMaterial[]> => {
  const prefs = await readPreferences()
  return [...prefs.history].sort(
    (left, right) =>
      (right.usageCount || 1) - (left.usageCount || 1) || (right.timestamp || 0) - (left.timestamp || 0)
  )
}

export const isFavorite = async (name: string): Promise<boolean> => {
  const prefs = await readPreferences()
  return prefs.favorites.some((m) => m.name === name)
}
