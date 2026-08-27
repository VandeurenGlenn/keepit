#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [catalogName, backupPath] = process.argv.slice(2)
if (!['alelek', 'desco'].includes(catalogName) || !backupPath) {
  throw new Error('Gebruik: node scripts/restore-local-image-references.mjs alelek|desco /pad/naar/backup-catalogus.json')
}

const databaseDirectory = resolve('.database')
const catalogPath = resolve(databaseDirectory, `${catalogName}-materials.json`)
const productImagesDirectory = resolve(databaseDirectory, 'product-images')
const cacheFile = (imageUrl, variant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`
const itemKey = (item) => String(item.articleNumber || item.productNumber || item.name || '')
const supportedLocalImage = (value) => /^\/(?:cache|catalog-assets)\/\S+$/i.test(String(value || '').trim())

const current = JSON.parse(await readFile(catalogPath, 'utf8'))
const backup = JSON.parse(await readFile(resolve(backupPath), 'utf8'))
const cached = new Set(await readdir(productImagesDirectory))
const backupItems = new Map((backup.items || []).map((item) => [itemKey(item), item]))
let restored = 0

for (const item of current.items || []) {
  if (item.image) continue
  const previousImage = backupItems.get(itemKey(item))?.image
  if (!supportedLocalImage(previousImage)) continue
  if (!['card', 'detail'].every((variant) => cached.has(cacheFile(previousImage, variant)))) continue
  item.image = previousImage
  restored += 1
}

current.updatedAt = new Date().toISOString()
const temporary = `${catalogPath}.${randomUUID()}.tmp`
await writeFile(temporary, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
await rename(temporary, catalogPath)
console.log(`✓ ${catalogName}: ${restored} geldige lokale beeldverwijzingen hersteld; nieuwe verrijkingen behouden.`)
