#!/usr/bin/env node

import { mkdir } from 'fs/promises'
import { resolve } from 'path'
import { spawnSync } from 'child_process'

const rootDir = process.cwd()
const snapshotDir = resolve(rootDir, 'catalog-snapshots')
const releaseTag = 'catalog-snapshots'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result
}

const main = async () => {
  const release = spawnSync('gh', ['release', 'view', releaseTag, '--json', 'assets'], {
    cwd: rootDir,
    encoding: 'utf8'
  })

  if (release.error) throw release.error
  if (release.status !== 0) throw new Error(release.stderr.trim() || `Unable to read GitHub Release ${releaseTag}.`)

  const data = JSON.parse(release.stdout)
  const archiveName = data.assets
    .map((asset) => asset.name)
    .filter((name) => /^catalog-snapshot-.*\.zip$/i.test(name))
    .sort((left, right) => right.localeCompare(left))[0]

  if (!archiveName) throw new Error(`No catalog snapshot assets found in GitHub Release ${releaseTag}.`)

  await mkdir(snapshotDir, { recursive: true })
  run('gh', ['release', 'download', releaseTag, '--pattern', archiveName, '--dir', snapshotDir, '--clobber'])
  run(process.execPath, ['./scripts/catalog-restore.mjs', resolve(snapshotDir, archiveName)])
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
