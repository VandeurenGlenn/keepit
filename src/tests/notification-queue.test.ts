import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeUnreadNotifications, notificationTarget } from '../frontend/helpers/notification-queue.ts'

test('een live melding en een gelijktijdige serverlijst bewaren alle unieke ongelezen meldingen', () => {
  const live = { id: 'live', userId: 'user' }
  const saved = { id: 'saved', userId: 'user' }
  const ignored = [
    { id: 'other', userId: 'other' },
    { id: 'read', userId: 'user', readAt: '2026-11-22' },
    { id: 'dismissed', userId: 'user' }
  ]
  assert.deepEqual(mergeUnreadNotifications([live], [saved, live, ...ignored], 'user', new Set(['dismissed'])), [live, saved])
})

test('meldingen openen alleen interne Keepit-routes', () => {
  assert.equal(notificationTarget('#!/planning'), '#!/planning')
  assert.equal(notificationTarget('https://example.test/'), undefined)
  assert.equal(notificationTarget(undefined), undefined)
})
