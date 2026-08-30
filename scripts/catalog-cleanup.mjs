#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = process.cwd()
const databaseDirectory = resolve(root, '.database')
const productImagesDirectory = resolve(databaseDirectory, 'product-images')
const descoOriginalsDirectory = resolve(root, 'www', 'cache', 'desco')
const backupsDirectory = resolve(databaseDirectory, 'backups')
const snapshotsDirectory = resolve(root, 'catalog-snapshots')
const imageStatePath = resolve(databaseDirectory, 'product-image-cache-state.json')
const reportPath = resolve(databaseDirectory, 'exports', 'catalog-cleanup.json')
const sourceFiles = [
  resolve(databaseDirectory, 'desco-materials.json'),
  resolve(databaseDirectory, 'alelek-materials.json'),
  resolve(databaseDirectory, 'alelek-manufacturer-overrides.json')
]

const cacheFile = (imageUrl, variant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`

const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}

const writeJsonAtomic = async (path, value) => {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

const collectImages = (value, result) => {
  if (Array.isArray(value)) return value.forEach((item) => collectImages(item, result))
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'image' && typeof child === 'string' && child) result.add(child)
    else collectImages(child, result)
  }
}

const pathSize = async (path) => {
  const info = await stat(path)
  if (!info.isDirectory()) return info.size
  return (await Promise.all((await readdir(path)).map((name) => pathSize(join(path, name)))))
    .reduce((sum, bytes) => sum + bytes, 0)
}

const fileRecord = async (directory, name) => {
  const path = join(directory, name)
  const info = await stat(path)
  return { name, bytes: await pathSize(path), modifiedAt: info.mtimeMs }
}

const isWebp = async (path) => {
  try {
    const buffer = await readFile(path)
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  } catch {
    return false
  }
}

const sumBytes = (records) => records.reduce((sum, item) => sum + item.bytes, 0)
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const main = async () => {
  const apply = process.argv.includes('--apply')
  const sourceUrls = new Set()
  for (const path of sourceFiles) collectImages(await readJson(path, {}), sourceUrls)

  const expectedWebps = new Set()
  for (const url of sourceUrls) {
    expectedWebps.add(cacheFile(url, 'card'))
    expectedWebps.add(cacheFile(url, 'detail'))
  }
  const webpRecords = await Promise.all((await readdir(productImagesDirectory).catch(() => []))
    .filter((name) => name.endsWith('.webp') && !expectedWebps.has(name))
    .map((name) => fileRecord(productImagesDirectory, name)))

  const descoRecords = []
  for (const name of await readdir(descoOriginalsDirectory).catch(() => [])) {
    const source = `/cache/desco/${name}`
    const complete = (await Promise.all(['card', 'detail'].map((variant) =>
      isWebp(resolve(productImagesDirectory, cacheFile(source, variant)))))).every(Boolean)
    if (complete) descoRecords.push(await fileRecord(descoOriginalsDirectory, name))
  }

  const snapshots = await Promise.all((await readdir(snapshotsDirectory).catch(() => []))
    .filter((name) => /^(?:catalog|cache|adapter)-snapshot-.*\.zip$/i.test(name))
    .map((name) => fileRecord(snapshotsDirectory, name)))
  const snapshotGroups = ['catalog-snapshot-', 'cache-snapshot-', 'adapter-snapshot-'].map((prefix) =>
    snapshots.filter((snapshot) => snapshot.name.startsWith(prefix)).sort((left, right) => right.modifiedAt - left.modifiedAt))
  const retainedSnapshots = snapshotGroups.map((group) => group[0]).filter(Boolean)
  const retainedCatalogSnapshot = snapshotGroups[0][0]
  const oldSnapshots = snapshotGroups.flatMap((group) => group.slice(1))

  const backupNames = await readdir(backupsDirectory).catch(() => [])
  const oldBackups = retainedCatalogSnapshot
    ? (await Promise.all(backupNames.map((name) => fileRecord(backupsDirectory, name))))
      .filter((record) => record.modifiedAt <= retainedCatalogSnapshot.modifiedAt)
    : []

  const imageState = await readJson(imageStatePath, { version: 1, updatedAt: '', failures: {} })
  const currentFailures = Object.fromEntries(Object.entries(imageState.failures || {})
    .filter(([, failure]) => sourceUrls.has(failure?.url)))
  const staleFailures = Object.keys(imageState.failures || {}).length - Object.keys(currentFailures).length

  const report = {
    generatedAt: new Date().toISOString(),
    applied: apply,
    retainedSnapshot: retainedCatalogSnapshot?.name || '',
    retainedSnapshots: retainedSnapshots.map((snapshot) => snapshot.name),
    orphanWebps: webpRecords.length,
    orphanWebpBytes: sumBytes(webpRecords),
    coveredDescoOriginals: descoRecords.length,
    coveredDescoOriginalBytes: sumBytes(descoRecords),
    staleImageFailures: staleFailures,
    oldBackups: oldBackups.length,
    oldBackupBytes: sumBytes(oldBackups),
    oldSnapshots: oldSnapshots.length,
    oldSnapshotBytes: sumBytes(oldSnapshots)
  }

  if (apply) {
    for (const record of webpRecords) await rm(join(productImagesDirectory, record.name))
    for (const record of descoRecords) await rm(join(descoOriginalsDirectory, record.name))
    for (const record of oldBackups) await rm(join(backupsDirectory, record.name), { recursive: true })
    for (const record of oldSnapshots) await rm(join(snapshotsDirectory, record.name))
    imageState.failures = currentFailures
    imageState.updatedAt = new Date().toISOString()
    await writeJsonAtomic(imageStatePath, imageState)
  }
  await writeJsonAtomic(reportPath, report)

  const prefix = apply ? '✓' : 'Dry-run:'
  console.log(`${prefix} ${webpRecords.length} verweesde WebP's (${megabytes(report.orphanWebpBytes)}).`)
  console.log(`${prefix} ${descoRecords.length} gedekte Desco-originelen (${megabytes(report.coveredDescoOriginalBytes)}).`)
  console.log(`${prefix} ${staleFailures} verouderde beeldfouten.`)
  console.log(`${prefix} ${oldBackups.length} tussentijdse back-ups (${megabytes(report.oldBackupBytes)}).`)
  console.log(`${prefix} ${oldSnapshots.length} oude snapshots (${megabytes(report.oldSnapshotBytes)}).`)
  console.log(`Behouden snapshots: ${retainedSnapshots.map((snapshot) => snapshot.name).join(', ') || 'geen'}`)
  if (!apply) console.log('Voeg --apply toe om deze veilige selectie te verwijderen.')
  console.log(`Rapport: ${reportPath}`)
}

void main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
