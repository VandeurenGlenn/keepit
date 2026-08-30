#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'
import { normalizeSku, parseWeverDucreProductPage } from './manufacturer-enrichment.mjs'

const root = resolve('.')
const databaseDirectory = resolve(root, '.database')
const cacheDirectory = resolve(databaseDirectory, 'manufacturer-cache', 'weverducre')
const profileDirectory = resolve(databaseDirectory, 'browser-profiles', 'weverducre')
const catalogPath = resolve(databaseDirectory, 'alelek-materials.json')
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const valueAfter = (name) => process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1)
const positiveNumber = (name, fallback, minimum = 1) => {
  const parsed = Number(valueAfter(name))
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback
}
const maximum = positiveNumber('--max', 100)
const delayMs = positiveNumber('--delay-ms', 2500, 1500)
const headless = process.argv.includes('--headless')
const skipImages = process.argv.includes('--skip-images')
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const searchUrl = (sku) => `https://www.weverducre.com/en/action/search/detail?q=${encodeURIComponent(sku)}`
const cachePath = (url) => resolve(cacheDirectory, `${createHash('sha256').update(url).digest('hex')}.html`)
const productSku = (item) => String(
  item.technicalData?.['Artikelcode leverancier'] || item.manufacturerData?.MPN || item.productNumber || ''
).trim()
const isWeverDucre = (item) => /^wever\s*&?\s*ducr[eé]$/i.test(String(
  item.technicalData?.Merk || item.manufacturerData?.Merk || ''
).trim())

const run = (command, args) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
  child.once('error', rejectPromise)
  child.once('exit', (code, signal) => code === 0
    ? resolvePromise()
    : rejectPromise(new Error(`${command} stopte met ${signal || `code ${code}`}`)))
})

const waitForChrome = async () => {
  const activePortPath = resolve(profileDirectory, 'DevToolsActivePort')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(activePortPath, 'utf8')).trim().split('\n')
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return Number(port)
    } catch {
      // Chrome is still starting.
    }
    await sleep(100)
  }
  throw new Error('Chrome debuggingpoort kwam niet beschikbaar')
}

const openPage = async (port) => {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Chrome-tab kon niet geopend worden (${response.status})`)
  const target = await response.json()
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolvePromise, rejectPromise) => {
    socket.once('open', resolvePromise)
    socket.once('error', rejectPromise)
  })
  let identifier = 0
  const pending = new Map()
  const events = new Map()
  socket.on('message', (data) => {
    const message = JSON.parse(String(data))
    if (message.id && pending.has(message.id)) {
      const { resolve: resolvePromise, reject: rejectPromise } = pending.get(message.id)
      pending.delete(message.id)
      return message.error ? rejectPromise(new Error(message.error.message)) : resolvePromise(message.result)
    }
    for (const callback of events.get(message.method) || []) callback(message.params)
  })
  const send = (method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
    const id = ++identifier
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const once = (method, timeout = 30_000) => new Promise((resolvePromise, rejectPromise) => {
    const callbacks = events.get(method) || []
    const done = (value) => {
      clearTimeout(timer)
      events.set(method, callbacks.filter((entry) => entry !== done))
      resolvePromise(value)
    }
    callbacks.push(done)
    events.set(method, callbacks)
    const timer = setTimeout(() => {
      events.set(method, callbacks.filter((entry) => entry !== done))
      rejectPromise(new Error(`Timeout op ${method}`))
    }, timeout)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  return { socket, send, once, targetId: target.id }
}

const main = async () => {
  await access(chromeExecutable)
  await mkdir(cacheDirectory, { recursive: true })
  await mkdir(profileDirectory, { recursive: true })
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  const candidates = []
  for (const item of catalog.items || []) {
    if (!isWeverDucre(item)) continue
    const sku = productSku(item)
    if (!sku || candidates.some((entry) => normalizeSku(entry) === normalizeSku(sku))) continue
    try {
      await access(cachePath(searchUrl(sku)))
    } catch {
      candidates.push(sku)
    }
    if (candidates.length >= maximum) break
  }
  if (!candidates.length) {
    console.log('Wever & Ducré: geen nieuwe ongecachete producten gevonden.')
    return
  }

  await rm(resolve(profileDirectory, 'DevToolsActivePort'), { force: true })
  const chrome = spawn(chromeExecutable, [
    `--user-data-dir=${profileDirectory}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    ...(headless ? ['--headless=new'] : []),
    'about:blank'
  ], { stdio: 'ignore' })
  let page
  try {
    const port = await waitForChrome()
    page = await openPage(port)
    console.log(`Wever & Ducré: ${candidates.length} officiële pagina's ophalen (${delayMs} ms pauze)…`)
    let cached = 0
    for (const [index, sku] of candidates.entries()) {
      const url = searchUrl(sku)
      const loaded = page.once('Page.loadEventFired').catch(() => undefined)
      await page.send('Page.navigate', { url })
      await loaded
      await sleep(delayMs)
      const evaluation = await page.send('Runtime.evaluate', {
        expression: `({
          html: document.documentElement.outerHTML,
          text: document.body?.innerText || '',
          href: location.href
        })`,
        returnByValue: true
      })
      const pageValue = evaluation.result?.value || {}
      const html = String(pageValue.html || '')
      const pageText = String(pageValue.text || '')
      const finalUrl = String(pageValue.href || '')
      const result = parseWeverDucreProductPage(html, sku, url)
      if (result) {
        await writeFile(cachePath(url), html, 'utf8')
        cached += 1
        console.log(`  ${index + 1}/${candidates.length} ✓ ${sku}`)
      } else if (
        normalizeSku(pageText).includes(normalizeSku(sku)) &&
        !/\/action\/search\/detail/i.test(finalUrl)
      ) {
        // Cache verified accessory/lamp pages too. They intentionally produce no
        // image match, but must not block every later batch indefinitely.
        await writeFile(cachePath(url), html, 'utf8')
        cached += 1
        console.log(`  ${index + 1}/${candidates.length} - ${sku}: exact product, geen officieel productbeeld`)
      } else {
        console.log(`  ${index + 1}/${candidates.length} ! ${sku}: geen verifieerbare productpagina`)
      }
    }
    console.log(`Wever & Ducré: ${cached}/${candidates.length} exacte productpagina's gecachet.`)
  } finally {
    page?.socket.close()
    chrome.kill('SIGTERM')
  }

  await run(process.execPath, [
    './scripts/manufacturer-enrichment.mjs', '--catalog=alelek', '--brands=weverducre',
    // Process every cached Wever page, including older cache entries that sort
    // before this batch. Cache-only mode still performs zero network requests.
    '--max=100000', '--cached-only', '--reprocess', '--apply', '--publish-images'
  ])
  if (!skipImages) {
    await run(process.execPath, [
      './server/cli.js', 'images', 'alelek', '--provider=wever', '--concurrency=2', '--allow-failures'
    ])
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
