import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkspaceRoute } from '../frontend/helpers/workspace-route.ts'

test('workspace routes preserve encoded identifiers and invitation parameters', () => {
  const quote = parseWorkspaceRoute('#!/quote?selected=old%2Fquote%3Fid%3Da%3Db')
  assert.equal(quote.known, true)
  assert.equal(quote.path, 'quote')
  assert.equal(quote.params.get('selected'), 'old/quote?id=a=b')
  const registration = parseWorkspaceRoute('#!/register?email=user%2Bwork%40example.test')
  assert.equal(registration.params.get('email'), 'user+work@example.test')
})

test('unknown and malformed deep links are handled without throwing', () => {
  assert.equal(parseWorkspaceRoute('').path, 'home')
  assert.equal(parseWorkspaceRoute('#!/not-a-page').known, false)
  assert.equal(parseWorkspaceRoute('#!/quote?selected=%ZZ').params.get('selected'), '%ZZ')
})
