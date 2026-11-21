import type { WorkLocation } from '../../types/index.js'
import { api } from '../api/client.js'
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
}

let ownerId = ''
let flushing = false
let initialized = false

const storageKey = () => ownerId ? offlineStorageKey(ownerId) : ''

const read = (key = storageKey()): OfflineAction[] => {
  if (!key) return []
  return parseStoredActions<OfflineAction>(localStorage.getItem(key))
}

const write = (actions: OfflineAction[], key = storageKey()) => {
  if (!key) throw new Error('Offline registraties kunnen pas na aanmelden worden opgeslagen.')
  localStorage.setItem(key, JSON.stringify(actions))
  if (key === storageKey()) window.dispatchEvent(new CustomEvent('keepit-sync-status', { detail: { pending: actions.length, actions } }))
}

export const setOfflineActionOwner = (userId?: string) => {
  ownerId = String(userId || '').trim()
  const actions = read()
  window.dispatchEvent(new CustomEvent('keepit-sync-status', { detail: { pending: actions.length, actions } }))
}

export const getOfflineActions = () => read()
export const getUnscopedOfflineActions = () => parseStoredActions<OfflineAction>(localStorage.getItem(legacyOfflineStorageKey))

export const claimUnscopedOfflineActions = () => {
  const count = claimLegacyActions<OfflineAction>(localStorage, ownerId)
  const actions = read()
  window.dispatchEvent(new CustomEvent('keepit-sync-status', { detail: { pending: actions.length, actions } }))
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
  if (flushing || !ownerId || !navigator.onLine) return
  const key = storageKey()
  flushing = true
  try {
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
        const message = isNetworkFailure(error)
          ? 'Geen verbinding'
          : ((error as Error)?.message || 'Synchronisatie mislukt')
        const actions = read(key).map((item) =>
          item.id === action.id
            ? { ...item, attempts: (item.attempts || 0) + 1, lastError: message }
            : item
        )
        write(actions, key)
        break
      }
    }
  } finally {
    flushing = false
    if (key !== storageKey() && ownerId) queueMicrotask(() => void flushOfflineActions())
  }
}

export const retryOfflineActions = flushOfflineActions

export const initializeOfflineSync = () => {
  if (initialized) return
  initialized = true
  window.addEventListener('online', () => void flushOfflineActions())
  if (navigator.onLine) void flushOfflineActions()
}
