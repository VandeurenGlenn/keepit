import assert from 'node:assert/strict'
import test from 'node:test'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const storage = new MemoryStorage()
globalThis.localStorage = storage as unknown as Storage
const offline = await import('../frontend/helpers/offline-storage.ts')

test('offline registraties blijven gescheiden per medewerker', () => {
  storage.setItem(offline.offlineStorageKey('employee-a'), JSON.stringify([{ id: 'a', job: 'job-a' }]))
  storage.setItem(offline.offlineStorageKey('employee-b'), JSON.stringify([{ id: 'b', job: 'job-b' }]))
  assert.equal(offline.parseStoredActions<{ id: string; job: string }>(storage.getItem(offline.offlineStorageKey('employee-a')))[0].job, 'job-a')
  assert.equal(offline.parseStoredActions<{ id: string; job: string }>(storage.getItem(offline.offlineStorageKey('employee-b')))[0].job, 'job-b')
})

test('oude ongescope offline uren worden nooit automatisch geclaimd', () => {
  storage.setItem(offline.legacyOfflineStorageKey, JSON.stringify([
    { id: 'legacy-1', type: 'checkin', job: 'legacy-job', timestamp: 50, createdAt: 50 }
  ]))
  assert.equal(storage.getItem(offline.offlineStorageKey('employee-c')), null)
  assert.equal(offline.parseStoredActions(storage.getItem(offline.legacyOfflineStorageKey)).length, 1)

  assert.equal(offline.claimLegacyActions(storage as unknown as Storage, 'employee-c'), 1)
  const claimed = offline.parseStoredActions<{ id: string; job: string }>(storage.getItem(offline.offlineStorageKey('employee-c')))
  assert.equal(claimed[0].job, 'legacy-job')
  assert.equal(storage.getItem(offline.legacyOfflineStorageKey), null)
})
