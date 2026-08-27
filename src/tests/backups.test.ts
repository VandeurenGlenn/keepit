import assert from 'node:assert/strict'
import test from 'node:test'

import { BACKUP_DATASETS, validateBackup } from '../server/helpers/backups.ts'

const validBackup = () => ({
  format: 'keepit-backup',
  version: 1,
  createdAt: '2026-08-25T12:00:00.000Z',
  reason: 'manual',
  datasets: Object.fromEntries(BACKUP_DATASETS.map((name) => [name, {}]))
})

test('accepts a complete Keepit backup', () => {
  const backup = validBackup()
  assert.equal(validateBackup(backup).createdAt, backup.createdAt)
})

test('rejects a backup with a missing dataset', () => {
  const backup = validBackup()
  delete backup.datasets.hours
  assert.throws(() => validateBackup(backup), /hours/)
})

test('rejects unsupported backup versions', () => {
  const backup = { ...validBackup(), version: 2 }
  assert.throws(() => validateBackup(backup), /niet ondersteund/)
})
