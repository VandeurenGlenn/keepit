import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'

type SyncTimestamps = {
  desco?: number
  alelek?: number
}

const syncTrackerPath = resolve('.database', 'sync-timestamps.json')
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

const readTimestamps = async (): Promise<SyncTimestamps> => {
  try {
    const raw = await readFile(syncTrackerPath, 'utf8')
    return JSON.parse(raw) as SyncTimestamps
  } catch {
    return {}
  }
}

const writeTimestamps = async (timestamps: SyncTimestamps): Promise<void> => {
  await mkdir(resolve('.database'), { recursive: true })
  await writeFile(syncTrackerPath, JSON.stringify(timestamps, null, 2), 'utf8')
}

const shouldSync = (source: 'desco' | 'alelek', timestamps: SyncTimestamps): boolean => {
  const lastSync = timestamps[source]
  if (!lastSync) return true
  const now = Date.now()
  return now - lastSync >= ONE_WEEK_MS
}

export const recordSync = async (source: 'desco' | 'alelek'): Promise<void> => {
  const timestamps = await readTimestamps()
  timestamps[source] = Date.now()
  await writeTimestamps(timestamps)
}

export const shouldSyncDesco = async (): Promise<boolean> => {
  const timestamps = await readTimestamps()
  return shouldSync('desco', timestamps)
}

export const shouldSyncAlelek = async (): Promise<boolean> => {
  const timestamps = await readTimestamps()
  return shouldSync('alelek', timestamps)
}
