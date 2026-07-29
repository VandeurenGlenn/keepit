import { execFile } from 'node:child_process'
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve('.')
const databaseDir = join(root, '.database')
const catalogPath = join(databaseDir, 'desco-materials.json')
const metadataPath = join(databaseDir, 'desco-materials.metadata.json')
const snapshotDir = join(root, 'catalog-snapshots')
const cacheDir = join(root, 'www', 'cache', 'desco')
const dryRun = process.argv.includes('--dry-run')

const keyValues = (item) => [item.articleNumber, item.productNumber, item.name]
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => value.trim().toLowerCase())

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

const readSnapshotCatalog = async (snapshotPath) => {
  const { stdout } = await execFileAsync('unzip', [
    '-p',
    snapshotPath,
    '.database/desco-materials.json'
  ], { maxBuffer: 100 * 1024 * 1024 })
  return JSON.parse(stdout)
}

const localImageExists = async (image) => {
  if (typeof image !== 'string' || !image.startsWith('/cache/desco/')) return false
  const filename = basename(image)
  if (!filename || filename !== image.slice('/cache/desco/'.length)) return false

  try {
    await access(join(cacheDir, filename))
    return true
  } catch {
    return false
  }
}

const atomicWriteJson = async (path, value) => {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

const snapshots = (await readdir(snapshotDir))
  .filter((name) => name.endsWith('.zip'))
  .sort()
  .reverse()

if (snapshots.length === 0) {
  throw new Error(`No catalog snapshots found in ${snapshotDir}`)
}

const sourceByKey = new Map()
let sourceSnapshot = ''

for (const snapshot of snapshots) {
  let sourceCatalog
  try {
    sourceCatalog = await readSnapshotCatalog(join(snapshotDir, snapshot))
  } catch {
    continue
  }

  let accepted = 0
  for (const item of sourceCatalog.items || []) {
    if (!(await localImageExists(item.image))) continue
    const keys = keyValues(item)
    if (keys.length === 0) continue
    keys.forEach((key) => {
      if (!sourceByKey.has(key)) sourceByKey.set(key, item)
    })
    accepted += 1
  }

  if (accepted > 0 && !sourceSnapshot) sourceSnapshot = snapshot
}

const catalog = await readJson(catalogPath)
const metadata = await readJson(metadataPath).catch(() => ({ source: 'desco-metadata', items: [] }))
const metadataByKey = new Map()
for (const item of metadata.items || []) keyValues(item).forEach((key) => metadataByKey.set(key, item))

let restoredImages = 0
let restoredDescriptions = 0

const restoredItems = (catalog.items || []).map((item) => {
  const keys = keyValues(item)
  const existing = keys.map((key) => metadataByKey.get(key)).find(Boolean) || {}
  const source = keys.map((key) => sourceByKey.get(key)).find(Boolean)
  if (!source) return { ...existing, ...item }

  const image = item.image || existing.image || source.image
  const description = item.description || existing.description || source.description
  const technicalData = item.technicalData || existing.technicalData || source.technicalData
  if (!item.image && !existing.image && image) restoredImages += 1
  if (!item.description && !existing.description && description) restoredDescriptions += 1

  return {
    ...existing,
    articleNumber: item.articleNumber || existing.articleNumber || source.articleNumber,
    productNumber: item.productNumber || existing.productNumber || source.productNumber,
    name: item.name || existing.name || source.name,
    description,
    image,
    technicalData,
    enrichedAt: existing.enrichedAt || source.enrichedAt || new Date().toISOString()
  }
})

const restoredCatalogItems = catalog.items.map((item, index) => ({
  ...item,
  description: item.description || restoredItems[index].description,
  image: item.image || restoredItems[index].image,
  technicalData: item.technicalData || restoredItems[index].technicalData
}))

console.log(`Recovery source: ${sourceSnapshot || 'none'}`)
console.log(`Recoverable local image links: ${restoredImages}`)
console.log(`Recoverable descriptions: ${restoredDescriptions}`)

if (dryRun) {
  console.log('Dry run: no files changed.')
  process.exit(0)
}

const backupDir = join(databaseDir, 'backups', `desco-cache-recovery-${new Date().toISOString().replaceAll(':', '-')}`)
await mkdir(backupDir, { recursive: true })
await copyFile(catalogPath, join(backupDir, 'desco-materials.json'))
await copyFile(metadataPath, join(backupDir, 'desco-materials.metadata.json')).catch(() => undefined)

await atomicWriteJson(metadataPath, {
  source: 'desco-metadata',
  updatedAt: new Date().toISOString(),
  items: restoredItems
})
await atomicWriteJson(catalogPath, {
  ...catalog,
  updatedAt: new Date().toISOString(),
  count: restoredCatalogItems.length,
  items: restoredCatalogItems
})

console.log(`Recovered Desco cache metadata. Backup: ${backupDir}`)
