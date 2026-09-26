import type { WorkLocation } from '../../types/index.js'
import { api } from '../api/client.js'
import { claimLegacyActions, legacyOfflineStorageKey, offlineStorageKey, parseStoredActions } from './offline-storage.js'

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

const read = (): OfflineAction[] => {
  const key = storageKey()
  if (!key) return []
  return parseStoredActions<OfflineAction>(localStorage.getItem(key))
}

const write = (actions: OfflineAction[]) => {
  const key = storageKey()
  if (!key) throw new Error('Offline registraties kunnen pas na aanmelden worden opgeslagen.')
  localStorage.setItem(key, JSON.stringify(actions))
  window.dispatchEvent(new CustomEvent('keepit-sync-status', { detail: { pending: actions.length, actions } }))
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

export const enqueueOfflineAction = (action: Omit<OfflineAction, 'id' | 'createdAt'>) => {
  const id = crypto.randomUUID()
  write([...read(), { ...action, id, createdAt: Date.now() }])
  return id
}

export const getPendingWorkState = () => {
  const actions = read()
  let currentJob: string | undefined
  let currentPrestationId: string | undefined
  for (const action of actions) {
    if (action.type === 'checkin') {
      currentJob = action.job
      currentPrestationId = `pending:${action.id}`
    } else if (action.type === 'checkout' && action.job === currentJob) {
      currentJob = undefined
      currentPrestationId = undefined
    }
  }
  return { currentJob, currentPrestationId, pending: actions.length }
}

export const flushOfflineActions = async () => {
  if (flushing || !ownerId || !navigator.onLine) return
  flushing = true
  let actions = read()
  try {
    for (const action of [...actions]) {
      try {
        if (action.type === 'checkin') {
          const result = await api.checkIn(action.job, action.timestamp, action.location, {
            source: 'offline-sync',
            clientRequestId: action.id
          })
          actions = actions.map((item) =>
            item.prestationId === `pending:${action.id}` ? { ...item, prestationId: result.id } : item
          )
        } else {
          await api.checkOut(action.job, action.timestamp, action.location, {
            prestationId: action.prestationId,
            clientRequestId: action.id
          })
        }
        actions = actions.filter((item) => item.id !== action.id)
        write(actions)
      } catch (error) {
        const message = isNetworkFailure(error)
          ? 'Geen verbinding'
          : ((error as Error)?.message || 'Synchronisatie mislukt')
        actions = actions.map((item) =>
          item.id === action.id
            ? { ...item, attempts: (item.attempts || 0) + 1, lastError: message }
            : item
        )
        write(actions)
        break
      }
    }
  } finally {
    flushing = false
  }
}

export const retryOfflineActions = flushOfflineActions

export const initializeOfflineSync = () => {
  if (initialized) return
  initialized = true
  window.addEventListener('online', () => void flushOfflineActions())
  if (navigator.onLine) void flushOfflineActions()
}
