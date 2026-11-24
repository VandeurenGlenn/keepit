import assert from 'node:assert/strict'
import test from 'node:test'
import { appendJobNote } from '../server/helpers/job-notes.ts'

const first = { id: 'one', text: 'Werf open', createdAt: '2026-11-23T08:00:00Z', author: 'one' }
const second = { ...first, id: 'two', text: 'Materiaal geleverd', author: 'two' }

test('een tweede jobnotitie houdt de eerste intact en een herpoging dupliceert niets', () => {
  const original = [first]
  const saved = appendJobNote(original, second)!
  assert.deepEqual(original, [first])
  assert.deepEqual(saved, { notes: [first, second], created: true })
  assert.deepEqual(appendJobNote(saved.notes, { ...second, createdAt: '2026-11-23T08:10:00Z' }), {
    notes: [first, second], created: false
  })
})

test('een bestaande notitie kan niet met hetzelfde ID vervangen worden', () => {
  assert.equal(appendJobNote([first], { ...first, text: 'Andere tekst' }), undefined)
  assert.equal(appendJobNote([first], { ...first, author: 'other' }), undefined)
})
