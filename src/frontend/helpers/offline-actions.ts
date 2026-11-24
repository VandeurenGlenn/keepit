import type { WorkLocation } from '../../types/index.js'
import { api, ApiError } from '../api/client.js'
import { claimLegacyActions, completeStoredWorkAction, legacyOfflineStorageKey, offlineStorageKey, parseStoredActions } from './offline-storage.js'

export type OfflineAction = {
  id: string
  type: 'checkin' | 'checkout'
  job: string
  timestamp: number
  location?: WorkLocation
  prestationId?: string
  createdAt: number
  attempts?: number
  lastError?: string
  failureKind?: 'network' | 'session' | 'rejected' | 'server'
}

let ownerId = ''
let flushingKey = ''
let initialized = false

const storageKey = () => ownerId ? offlineStorageKey(ownerId) : ''

const read = (key = storageKey()): OfflineAction[] => {
  if (!key) return []
  return parseStoredActions<OfflineAction>(localStorage.getItem(key))
}

export const getOfflineSyncStatus = () => {
  const key = storageKey()
  const actions = read(key)
  return { actions, pending: actions.length, syncing: Boolean(key && flushingKey === key) }
}

const publishSyncStatus = () => {
  window.dispatchEvent(new CustomEvent('keepit-sync-status', { detail: getOfflineSyncStatus() }))
}

const write = (actions: OfflineAction[], key = storageKey()) => {
  if (!key) throw new Error('Offline registraties kunnen pas na aanmelden worden opgeslagen.')
  localStorage.setItem(key, JSON.stringify(actions))
  if (key === storageKey()) publishSyncStatus()
}

export const setOfflineActionOwner = (userId?: string) => {
  ownerId = String(userId || '').trim()
  publishSyncStatus()
}

export const getOfflineActions = () => read()
export const getUnscopedOfflineActions = () => parseStoredActions<OfflineAction>(localStorage.getItem(legacyOfflineStorageKey))

export const claimUnscopedOfflineActions = () => {
  const count = claimLegacyActions<OfflineAction>(localStorage, ownerId)
  publishSyncStatus()
  return count
}

export const isNetworkFailure = (error: unknown) =>
  !navigator.onLine
  || error instanceof TypeError
  || `${(error as Error)?.message || ''}`.toLowerCase().includes('failed to fetch')

export const enqueueOfflineAction = (action: Omit<OfflineAction, 'id' | 'createdAt'>, id = crypto.randomUUID()) => {
  const current = read()
  if (!current.some((item) => item.id === id)) write([...current, { ...action, id, createdAt: Date.now() }])
  return id
}

export const getPendingWorkState = (currentJob?: string, currentPrestationId?: string) => {
  const actions = read()
  for (const action of actions) {
    if (action.type === 'checkin') {
      currentJob = action.job
      currentPrestationId = `pending:${action.id}`
    } else if (action.type === 'checkout' && action.job === currentJob
      && (!action.prestationId || !currentPrestationId || action.prestationId === currentPrestationId)) {
      currentJob = undefined
      currentPrestationId = undefined
    }
  }
  return { currentJob, currentPrestationId, pending: actions.length }
}

export const flushOfflineActions = async () => {
  if (flushingKey || !ownerId || !navigator.onLine) return
  const key = storageKey()
  if (!read(key).length) return
  flushingKey = key
  try {
    publishSyncStatus()
    while (key === storageKey() && navigator.onLine) {
      const [action] = read(key)
      if (!action) break
      try {
        let prestationId: string | undefined
        let closed = false
        if (action.type === 'checkin') {
          const result = await api.checkIn(action.job, action.timestamp, action.location, {
            source: 'offline-sync',
            clientRequestId: action.id
          })
          prestationId = result.id
          closed = result.checkout !== undefined
        } else {
          await api.checkOut(action.job, action.timestamp, action.location, {
            prestationId: action.prestationId,
            clientRequestId: action.id
          })
        }
        const actions = completeStoredWorkAction(read(key), action.id, prestationId)
        write(actions, key)
        if (prestationId && key === storageKey()) {
          window.dispatchEvent(new CustomEvent('keepit-checkin-synced', { detail: { requestId: action.id, prestationId, closed } }))
        }
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0
        const failureKind = isNetworkFailure(error) ? 'network'
          : status === 401 || status === 403 ? 'session'
          : status >= 400 && status < 500 && status !== 429 ? 'rejected' : 'server'
        const message = failureKind === 'network' ? 'Geen verbinding'
          : failureKind === 'session' ? 'Aanmelding controleren'
          : failureKind === 'rejected' && error instanceof ApiError ? error.message.slice(0, 240)
          : 'Keepit kon deze registratie niet verwerken.'
        const actions = read(key).map<OfflineAction>((item) =>
          item.id === action.id
            ? { ...item, attempts: (item.attempts || 0) + 1, lastError: message, failureKind }
            : item
        )
        write(actions, key)
        break
      }
    }
  } finally {
    flushingKey = ''
    publishSyncStatus()
    if (key !== storageKey() && ownerId) queueMicrotask(() => void flushOfflineActions())
  }
}

export const retryOfflineActions = flushOfflineActions

export const initializeOfflineSync = () => {
  if (initialized) return
  initialized = true
  window.addEventListener('online', () => void flushOfflineActions())
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key === storageKey() || event.key === legacyOfflineStorageKey) publishSyncStatus()
  })
  if (navigator.onLine) void flushOfflineActions()
}
