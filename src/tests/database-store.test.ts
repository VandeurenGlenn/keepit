import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readJsonFile } from '../server/database/json-file.ts'

test('een ontbrekend databasebestand initialiseert leeg', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'keepit-store-'))
  try {
    assert.equal(await readJsonFile(join(directory, 'missing.json')), undefined)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('een beschadigd databasebestand stopt in plaats van data te verbergen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'keepit-store-'))
  const file = join(directory, 'hours.json')
  try {
    await writeFile(file, '{niet-geldige-json', 'utf8')
    await assert.rejects(() => readJsonFile(file), /niet veilig lezen/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
