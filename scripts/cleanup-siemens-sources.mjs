#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const databaseDirectory = resolve('.database')
const importDirectory = resolve(databaseDirectory, 'imports', 'sieportal')
const assetDirectory = resolve(databaseDirectory, 'catalog-assets', 'sieportal')
const imageCacheDirectory = resolve(databaseDirectory, 'product-images')
const reportPath = resolve(databaseDirectory, 'exports', 'siemens-cleanup.json')

const cacheFile = (imageUrl, variant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`

const isWebp = async (path) => {
  try {
    const buffer = await readFile(path)
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  } catch {
    return false
  }
}

const writeJsonAtomic = async (path, value) => {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

const fileSize = async (path) => (await stat(path)).size

const main = async () => {
  const apply = process.argv.includes('--apply')
  const zipNames = (await readdir(importDirectory).catch(() => []))
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .sort()
  const assetNames = (await readdir(assetDirectory).catch(() => [])).sort()
  const removableAssets = []
  const retainedAssets = []

  for (const name of assetNames) {
    const source = `/catalog-assets/sieportal/${name}`
    const variants = ['card', 'detail'].map((variant) =>
      resolve(imageCacheDirectory, cacheFile(source, variant)))
    const complete = (await Promise.all(variants.map(isWebp))).every(Boolean)
    const record = { name, bytes: await fileSize(resolve(assetDirectory, name)) }
    if (complete) removableAssets.push(record)
    else retainedAssets.push(record)
  }

  const zipRecords = await Promise.all(zipNames.map(async (name) => ({
    name,
    bytes: await fileSize(resolve(importDirectory, name))
  })))
  const report = {
    generatedAt: new Date().toISOString(),
    applied: apply,
    deletedZips: apply ? zipRecords.length : 0,
    deletedZipBytes: apply ? zipRecords.reduce((sum, item) => sum + item.bytes, 0) : 0,
    removableAssets: removableAssets.length,
    removableAssetBytes: removableAssets.reduce((sum, item) => sum + item.bytes, 0),
    retainedAssets: retainedAssets.length,
    retainedAssetBytes: retainedAssets.reduce((sum, item) => sum + item.bytes, 0),
    retainedAssetNames: retainedAssets.map((item) => item.name)
  }

  if (apply) {
    for (const item of zipRecords) await unlink(join(importDirectory, item.name))
    for (const item of removableAssets) await unlink(join(assetDirectory, item.name))
  }
  await writeJsonAtomic(reportPath, report)

  const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  console.log(`${apply ? '✓' : 'Dry-run:'} ${zipRecords.length} geïmporteerde ZIP's (${megabytes(zipRecords.reduce((sum, item) => sum + item.bytes, 0))}).`)
  console.log(`${apply ? '✓' : 'Dry-run:'} ${removableAssets.length} originelen met geldige card + detail WebP (${megabytes(report.removableAssetBytes)}).`)
  console.log(`Beschermd: ${retainedAssets.length} originelen zonder volledige WebP-set (${megabytes(report.retainedAssetBytes)}).`)
  if (!apply) console.log('Voeg --apply toe om de veilige selectie te verwijderen.')
  console.log(`Rapport: ${reportPath}`)
}

void main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
