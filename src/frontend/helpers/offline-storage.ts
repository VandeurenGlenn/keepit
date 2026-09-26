export type StoredAction = { id: string }

export const legacyOfflineStorageKey = 'keepit.offlineActions'
export const offlineStorageKey = (userId: string) => `keepit.offlineActions.${userId}`

export const parseStoredActions = <T extends StoredAction>(value: string | null): T[] => {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const claimLegacyActions = <T extends StoredAction>(storage: Storage, userId: string): number => {
  if (!userId) throw new Error('Meld je eerst aan om oude offline registraties te herstellen.')
  const legacyActions = parseStoredActions<T>(storage.getItem(legacyOfflineStorageKey))
  if (!legacyActions.length) return 0
  const key = offlineStorageKey(userId)
  const current = parseStoredActions<T>(storage.getItem(key))
  const currentIds = new Set(current.map((action) => action.id))
  storage.setItem(key, JSON.stringify([...current, ...legacyActions.filter((action) => !currentIds.has(action.id))]))
  storage.removeItem(legacyOfflineStorageKey)
  return legacyActions.length
}
