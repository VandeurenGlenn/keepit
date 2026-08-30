#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve('.')
const argv = process.argv.slice(2)
const valueAfter = (name) => argv.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1)
const number = (name, fallback, minimum = 1) => {
  const parsed = Number(valueAfter(name))
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback
}
const catalog = (valueAfter('--catalog') || 'alelek').trim().toLowerCase()
const maximum = number('--max', 100)
const delayMs = number('--delay-ms', 2500, 1500)
const dailyLimit = number('--daily-limit', 500)
const skipImages = argv.includes('--skip-images')
const skipWever = argv.includes('--skip-wever') || catalog !== 'alelek'
const techlinkInput = valueAfter('--techlink')
const requestedBrands = valueAfter('--brands')?.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)

const adapters = [
  ['bosch', 'bosch'],
  ['icecat', 'icecat'],
  ['eaton', 'eaton'],
  ['rittal', 'rittal'],
  ['ledlines', 'ledlines'],
  ['exterus', 'exterus'],
  ['geberit', 'geberit'],
  ['viega', 'viega'],
  ['solerpalau', 'soler'],
  ['fischer', 'fischer'],
  ['gree', 'gree'],
  ['panasonic', 'panasonic'],
  ['etherma', 'etherma']
].filter(([brand]) => !requestedBrands || requestedBrands.includes(brand))

const run = (command, args) => new Promise((resolvePromise) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
  child.once('error', (error) => resolvePromise({ ok: false, error: error.message }))
  child.once('exit', (code, signal) => resolvePromise({
    ok: code === 0,
    error: code === 0 ? '' : `${signal || `exitcode ${code}`}`
  }))
})

if (!['alelek', 'desco'].includes(catalog)) {
  console.error('✗ --catalog moet alelek of desco zijn')
  process.exit(1)
}

const failures = []

if (catalog === 'alelek' && techlinkInput) {
  console.log('\n=== TECHLINK IMPORT ===')
  const techlinkImport = await run(process.execPath, [
    './scripts/product-data-images.mjs', 'techlink', techlinkInput, '--apply'
  ])
  if (!techlinkImport.ok) failures.push(`techlink-import: ${techlinkImport.error}`)
}

if (catalog === 'alelek' && !skipImages) {
  console.log('\n=== TECHLINK BEELDEN ===')
  const techlinkImages = await run(process.execPath, [
    './server/cli.js', 'images', 'alelek', '--provider=techlink',
    '--concurrency=6', '--allow-failures'
  ])
  if (!techlinkImages.ok) failures.push(`techlink-beelden: ${techlinkImages.error}`)
}

for (const [brand, provider] of adapters) {
  console.log(`\n=== ${brand.toUpperCase()} ===`)
  const enrichment = await run(process.execPath, [
    './scripts/manufacturer-enrichment.mjs', `--catalog=${catalog}`, `--brands=${brand}`,
    `--max=${maximum}`, `--delay-ms=${delayMs}`, `--daily-limit=${dailyLimit}`,
    '--apply', '--publish-images'
  ])
  if (!enrichment.ok) {
    failures.push(`${brand}: ${enrichment.error}`)
    continue
  }
  if (!skipImages) {
    const images = await run(process.execPath, [
      './server/cli.js', 'images', catalog, `--provider=${provider}`,
      '--concurrency=2', '--allow-failures'
    ])
    if (!images.ok) failures.push(`${brand}-beelden: ${images.error}`)
  }
}

if (!skipWever && (!requestedBrands || requestedBrands.includes('weverducre'))) {
  console.log('\n=== WEVER & DUCRÉ ===')
  const wever = await run(process.execPath, [
    './scripts/weverducre-browser-enrichment.mjs', `--max=${maximum}`, `--delay-ms=${delayMs}`,
    ...(skipImages ? ['--skip-images'] : [])
  ])
  if (!wever.ok) failures.push(`weverducre: ${wever.error}`)
}

if (failures.length) {
  console.warn('\nKlaar met gedeeltelijke fouten:')
  failures.forEach((failure) => console.warn(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log('\n✓ Alle geselecteerde fabrikantadapters zijn afgewerkt.')
}
