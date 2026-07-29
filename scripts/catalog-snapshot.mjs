#!/usr/bin/env node

import { access, mkdir } from 'fs/promises'
import { resolve, relative } from 'path'
import { spawnSync } from 'child_process'

const rootDir = process.cwd()
const outputDir = resolve(rootDir, 'catalog-snapshots')

const candidates = [
  '.database/desco-materials.json',
  '.database/desco-materials.metadata.json',
  '.database/alelek-materials.json',
  '.database/alelek-materials.metadata.json',
  'www/cache/desco',
  'www/cache/alelek'
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
  const requestedName = process.argv[2]?.trim()
  const snapshotName = requestedName && requestedName.length > 0 ? requestedName : 'catalog-snapshot'

  const existingEntries = []
  for (const candidate of candidates) {
    if (await exists(candidate)) existingEntries.push(candidate)
  }

  if (existingEntries.length === 0) {
    console.error('No catalog/cache files found to include in snapshot.')
    process.exit(1)
    return
  }

  await mkdir(outputDir, { recursive: true })

  const zipFileName = `${snapshotName}-${formatTimestamp(new Date())}.zip`
  const zipPath = resolve(outputDir, zipFileName)

  const args = ['-r', zipPath, ...existingEntries.map((entry) => relative(rootDir, resolve(rootDir, entry)))]

  const result = spawnSync('zip', args, {
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
