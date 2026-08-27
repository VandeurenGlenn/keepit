import test from 'node:test'
import assert from 'node:assert/strict'
import { repairProductImageUrl } from '../server/helpers/image-url-repair.ts'

test('repairs comma-corrupted ABB image hosts and extensions', () => {
  assert.equal(
    repairProductImageUrl('https://cdn,productimages,abb,com/9PAA00000094557_720x540,jpg'),
    'https://cdn.productimages.abb.com/9PAA00000094557_720x540.jpg'
  )
})

test('uses the first image when a supplier concatenates multiple URLs', () => {
  assert.equal(
    repairProductImageUrl('http://example.com/one.jpg|http://example.com/two.jpg'),
    'http://example.com/one.jpg'
  )
})

test('turns Google Drive sharing links into direct download links', () => {
  assert.equal(
    repairProductImageUrl('https://drive.google.com/file/d/abc123/edit'),
    'https://drive.usercontent.google.com/download?id=abc123&export=download&confirm=t'
  )
})
