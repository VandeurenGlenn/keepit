#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const execFileAsync = promisify(execFile)

const exists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const runBuild = () => new Promise((resolvePromise, rejectPromise) => {
  console.log('Frontend- of serverbuild ontbreekt; productiebuild wordt voorbereid…')
  const child = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  child.once('error', rejectPromise)
  child.once('exit', (code, signal) => code === 0
    ? resolvePromise()
    : rejectPromise(new Error(`Build stopte met ${signal || `code ${code}`}`)))
})

const frontend = resolve(root, 'www', 'index.html')
const server = resolve(root, 'server', 'server.js')
const buildRevisionPath = resolve(root, 'server', '.build-revision')
const currentRevision = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })
  .then(({ stdout }) => stdout.trim())
  .catch(() => 'standalone')
const builtRevision = await readFile(buildRevisionPath, 'utf8').then((value) => value.trim()).catch(() => '')
const buildMissing = !(await exists(frontend)) || !(await exists(server))
const buildOutdated = builtRevision !== currentRevision

if (buildMissing || buildOutdated) {
  if (buildOutdated && !buildMissing) console.log(`Nieuwe Keepit-revisie gedetecteerd (${currentRevision.slice(0, 8)}); productiebuild wordt vernieuwd…`)
  await runBuild()
  await writeFile(buildRevisionPath, `${currentRevision}\n`, 'utf8')
}

await import(pathToFileURL(server).href)
