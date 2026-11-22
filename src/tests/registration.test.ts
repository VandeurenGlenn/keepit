import assert from 'node:assert/strict'
import test from 'node:test'
import type { User } from '../types/index.js'
import { hasRegisteredEmail } from '../server/helpers/registration.ts'

test('een actief account vervangt een oude uitnodiging voor zijn werkadres of Google-login', () => {
  const users = { member: { email: 'werk@example.test', googleEmail: 'Login@example.test' } as User }
  assert.equal(hasRegisteredEmail(users, ' WERK@example.test '), true)
  assert.equal(hasRegisteredEmail(users, 'login@example.test'), true)
  assert.equal(hasRegisteredEmail(users, 'ander@example.test'), false)
  assert.equal(hasRegisteredEmail(users, ''), false)
})
