#!/usr/bin/env node

import { readdir } from 'fs/promises'
import { basename, isAbsolute, resolve } from 'path'
import { spawnSync } from 'child_process'

const rootDir = process.cwd()
const snapshotDir = resolve(rootDir, 'catalog-snapshots')

const findArchive = async () => {
  const args = process.argv.slice(2)
  const cacheOnly = args.includes('--cache-only')
  const adaptersOnly = args.includes('--adapters-only')
  if (cacheOnly && adaptersOnly) throw new Error('--cache-only en --adapters-only kunnen niet samen gebruikt worden')
  const requestedArchive = args.find((arg) => !arg.startsWith('--'))?.trim()
  if (requestedArchive) return resolve(rootDir, requestedArchive)

  const prefix = adaptersOnly ? 'adapter' : cacheOnly ? 'cache' : 'catalog'
  const snapshots = (await readdir(snapshotDir))
    .filter((name) => new RegExp(`^${prefix}-snapshot-.*\\.zip$`, 'i').test(name))
    .sort((left, right) => right.localeCompare(left))

  if (!snapshots[0]) throw new Error(`No ${prefix} snapshots found in ${snapshotDir}.`)
  return resolve(snapshotDir, snapshots[0])
}

const runUnzip = (args) => {
  const result = spawnSync('unzip', args, { cwd: rootDir, encoding: 'utf8' })
  if (result.error) {
    if (result.error.message.includes('ENOENT'))
      throw new Error('unzip command not found. Install unzip and try again.')
    throw result.error
  }
  if (result.status !== 0) throw new Error(result.stderr.trim() || `unzip exited with status ${result.status}.`)
  return result.stdout
}

const main = async () => {
  const archivePath = await findArchive()
  const entries = runUnzip(['-Z1', archivePath]).split('\n').filter(Boolean)

  const unsafeEntry = entries.find((entry) => isAbsolute(entry) || entry.split('/').includes('..'))
  if (unsafeEntry) throw new Error(`Unsafe archive entry rejected: ${unsafeEntry}`)

  const result = spawnSync('unzip', ['-o', archivePath, '-d', rootDir], { cwd: rootDir, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)

  console.log(`Snapshot restored from ${basename(archivePath)}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
