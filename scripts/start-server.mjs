#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

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
if (!(await exists(frontend)) || !(await exists(server))) await runBuild()

await import(pathToFileURL(server).href)
