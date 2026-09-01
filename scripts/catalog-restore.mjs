#!/usr/bin/env node

import { readdir } from 'fs/promises'
import { basename, isAbsolute, resolve } from 'path'
import { spawn, spawnSync } from 'child_process'

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

const validateArchiveEntries = (archivePath) =>
  new Promise((done, fail) => {
    const child = spawn('unzip', ['-Z1', archivePath], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] })
    let pending = ''
    let stderr = ''
    let rejectedEntry = ''

    const inspect = (entry) => {
      const normalized = entry.replaceAll('\\', '/')
      if (isAbsolute(normalized) || normalized.split('/').includes('..')) rejectedEntry = entry
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const entry of lines) {
        inspect(entry)
        if (rejectedEntry) child.kill()
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 16_384) stderr += chunk
    })
    child.once('error', (error) => {
      if (error.message.includes('ENOENT')) fail(new Error('unzip command not found. Install unzip and try again.'))
      else fail(error)
    })
    child.once('close', (code) => {
      if (pending) inspect(pending)
      if (rejectedEntry) fail(new Error(`Unsafe archive entry rejected: ${rejectedEntry}`))
      else if (code !== 0) fail(new Error(stderr.trim() || `unzip exited with status ${code}.`))
      else done()
    })
  })

const main = async () => {
  const archivePath = await findArchive()
  console.log('Snapshotinhoud controleren…')
  await validateArchiveEntries(archivePath)

  const result = spawnSync('unzip', ['-o', archivePath, '-d', rootDir], { cwd: rootDir, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)

  console.log(`Snapshot restored from ${basename(archivePath)}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
