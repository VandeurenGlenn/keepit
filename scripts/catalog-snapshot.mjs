#!/usr/bin/env node

import { access, mkdir } from 'fs/promises'
import { resolve, relative } from 'path'
import { spawnSync } from 'child_process'

const rootDir = process.cwd()
const outputDir = resolve(rootDir, 'catalog-snapshots')

const catalogCandidates = [
  '.database/desco-materials.json',
  '.database/desco-materials.metadata.json',
  '.database/alelek-materials.json',
  '.database/alelek-materials.metadata.json',
  '.database/alelek-manufacturer-overrides.json',
  '.database/alelek-scraper-state.json',
  '.database/sync-timestamps.json',
  '.database/exports/siemens-mall-audit.json'
]

const cacheCandidates = [
  '.database/product-image-cache-state.json',
  '.database/product-images',
  '.database/catalog-assets',
  'www/cache/desco',
  'www/cache/alelek'
]

const adapterCandidates = [
  '.database/alelek-manufacturer-overrides.json',
  '.database/desco-manufacturer-overrides.json',
  '.database/manufacturer-enrichment-state-desco.json',
  '.database/manufacturer-enrichment-state-alelek.json',
  '.database/manufacturer-cache'
]

const exists = async (path) => {
  try {
    await access(resolve(rootDir, path))
    return true
  } catch {
    return false
  }
}

const formatTimestamp = (date) => {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

const main = async () => {
  const args = process.argv.slice(2)
  const cacheOnly = args.includes('--cache-only')
  const adaptersOnly = args.includes('--adapters-only')
  if (cacheOnly && adaptersOnly) throw new Error('--cache-only en --adapters-only kunnen niet samen gebruikt worden')
  const requestedName = args.find((arg) => !arg.startsWith('--'))?.trim()
  const snapshotName = requestedName && requestedName.length > 0
    ? requestedName
    : adaptersOnly
      ? 'adapter-snapshot'
      : cacheOnly
        ? 'cache-snapshot'
        : 'catalog-snapshot'
  const candidates = adaptersOnly
    ? adapterCandidates
    : cacheOnly
      ? cacheCandidates
      : [...new Set([...catalogCandidates, ...cacheCandidates, ...adapterCandidates])]

  const existingEntries = []
  for (const candidate of candidates) {
    if (await exists(candidate)) existingEntries.push(candidate)
  }

  if (existingEntries.length === 0) {
    console.error(`No ${adaptersOnly ? 'adapter' : cacheOnly ? 'cache' : 'catalog/cache'} files found to include in snapshot.`)
    process.exit(1)
    return
  }

  await mkdir(outputDir, { recursive: true })

  const zipFileName = `${snapshotName}-${formatTimestamp(new Date())}.zip`
  const zipPath = resolve(outputDir, zipFileName)

  const zipArgs = ['-q', '-r', zipPath, ...existingEntries.map((entry) => relative(rootDir, resolve(rootDir, entry)))]

  const result = spawnSync('zip', zipArgs, {
    cwd: rootDir,
    stdio: 'inherit'
  })

  if (result.error) {
    if (result.error.message.includes('ENOENT')) {
      console.error('zip command not found. Install zip and try again.')
    } else {
      console.error(result.error.message)
    }
    process.exit(1)
    return
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
    return
  }

  console.log(`Snapshot created: ${zipPath}`)
}

void main()
