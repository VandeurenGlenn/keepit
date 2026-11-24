import assert from 'node:assert/strict'
import test from 'node:test'
import { isCacheableStaticResponse, staticCacheKey } from '../frontend/helpers/static-cache-policy.ts'

const origin = 'https://keepit.example'
const key = (path: string, mode: RequestMode) => staticCacheKey(new URL(path, origin), origin, mode)

test('offlinecache omvat de startpagina en statische bundels, geen bedrijfsgegevens', () => {
  assert.equal(key('/', 'navigate'), '/')
  assert.equal(key('/index.html', 'navigate'), '/')
  assert.equal(key('/shell.js', 'cors'), origin + '/shell.js')
  assert.equal(key('/assets/logo.svg', 'no-cors'), origin + '/assets/logo.svg')
  for (const path of ['/api/users', '/api/invoice/file.js', '/account', '/ws']) {
    assert.equal(key(path, 'navigate'), undefined)
    assert.equal(key(path, 'cors'), undefined)
  }
  assert.equal(key('https://other.example/shell.js', 'cors'), undefined)
})

test('een mislukte of private response overschrijft geen geldig cachebestand', () => {
  const response = (status: number, type: string, cacheControl = '', redirected = false) => ({
    status, redirected, headers: new Headers({ 'content-type': type, 'cache-control': cacheControl })
  })
  assert.equal(isCacheableStaticResponse(response(200, 'text/html; charset=utf-8'), true), true)
  assert.equal(isCacheableStaticResponse(response(503, 'text/html'), true), false)
  assert.equal(isCacheableStaticResponse(response(200, 'text/html'), false), false)
  assert.equal(isCacheableStaticResponse(response(200, 'text/html', '', true), true), false)
  assert.equal(isCacheableStaticResponse(response(200, 'text/html', 'max-age=60, private'), true), false)
  assert.equal(isCacheableStaticResponse(response(200, 'application/javascript', 'no-store'), false), false)
  assert.equal(isCacheableStaticResponse(response(200, 'application/javascript'), false), true)
})
