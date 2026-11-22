import assert from 'node:assert/strict'
import test from 'node:test'
import { LatestOperation } from '../frontend/helpers/latest-operation.ts'

test('een nieuw adres maakt een late gps- of detailaanvraag ongeldig', async () => {
  const operations = new LatestOperation()
  const first = operations.begin()
  let finish!: (value: string) => void
  const pending = new Promise<string>((resolve) => { finish = resolve })
  let address = ''
  const oldResult = pending.then((value) => { if (!first.aborted) address = value })
  const next = operations.begin()
  assert.equal(first.aborted, true)
  assert.equal(next.aborted, false)
  address = 'Nieuw handmatig adres'
  finish('Oud gps-adres')
  await oldResult
  assert.equal(address, 'Nieuw handmatig adres')
})

test('bij het sluiten wordt een actieve aanvraag geannuleerd', () => {
  const operations = new LatestOperation()
  const active = operations.begin()
  operations.cancel()
  operations.cancel()
  assert.equal(active.aborted, true)
  assert.equal(operations.begin().aborted, false)
})
