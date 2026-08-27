#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const catalogPath = resolve('.database/alelek-materials.json')
const imageCachePath = resolve('.database/product-images')
const outputDirectory = resolve('.database/exports/siemens-cax')

const argumentValue = (name, fallback) => {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return argument ? argument.slice(name.length + 3) : fallback
}

const cacheFile = (imageUrl, variant) =>
  `${createHash('sha256').update(`v2:${variant}:${imageUrl}`).digest('hex')}.webp`

const combineExistingBatches = async (range) => {
  const match = String(range || '').match(/^(\d+)-(\d+)$/)
  if (!match) throw new Error('Gebruik --combine=67-74 met een geldig oplopend bereik')
  const from = Number(match[1])
  const through = Number(match[2])
  if (from < 1 || through < from || through > 999) {
    throw new Error('Ongeldig batchbereik')
  }
  const contents = []
  for (let batch = from; batch <= through; batch += 1) {
    const number = String(batch).padStart(2, '0')
    contents.push((await readFile(resolve(outputDirectory, `siemens-cax-batch-${number}.txt`), 'utf8')).trim())
  }
  const destination = resolve(outputDirectory, `siemens-cax-batch-${from}-${through}.txt`)
  await writeFile(destination, `${contents.join('\n')}\n`, 'utf8')
  console.log(`✓ ${contents.join('\n').split('\n').length} productnummers gecombineerd uit batches ${from}–${through}.`)
  console.log(destination)
}

const main = async () => {
  const combine = argumentValue('combine', '')
  if (combine) return combineExistingBatches(combine)
  const batchSize = Math.max(1, Number(argumentValue('batch-size', '500')) || 500)
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  const cachedFiles = new Set(await readdir(imageCachePath).catch(() => []))
  const byMpn = new Map()

  for (const item of catalog.items || []) {
    const brand = String(item.technicalData?.Merk || item.manufacturerData?.Merk || '').trim()
    if (!/^siemens$/i.test(brand)) continue
    const mpn = String(
      item.technicalData?.['Artikelcode leverancier'] || item.manufacturerData?.MPN || ''
    ).trim()
    if (!mpn) continue
    const locallyComplete = item.image && ['card', 'detail'].every((variant) =>
      cachedFiles.has(cacheFile(item.image, variant))
    )
    if (locallyComplete || byMpn.has(mpn.toUpperCase())) continue
    byMpn.set(mpn.toUpperCase(), {
      mpn,
      ean: String(item.technicalData?.EAN || item.manufacturerData?.GTIN || ''),
      name: String(item.name || '').replaceAll('\t', ' ').replaceAll('\n', ' '),
      currentImage: String(item.image || '')
    })
  }

  const records = [...byMpn.values()].sort((left, right) => left.mpn.localeCompare(right.mpn))
  await mkdir(outputDirectory, { recursive: true })
  const batches = []
  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize)
    const number = String(batches.length + 1).padStart(2, '0')
    const path = resolve(outputDirectory, `siemens-cax-batch-${number}.txt`)
    await writeFile(path, `${batch.map((record) => record.mpn).join('\n')}\n`, 'utf8')
    batches.push(path)
  }
  await writeFile(
    resolve(outputDirectory, 'siemens-cax-overview.tsv'),
    `MPN\tEAN/GTIN\tProductnaam\tHuidige beeldbron\n${records.map((record) =>
      [record.mpn, record.ean, record.name, record.currentImage].join('\t')
    ).join('\n')}\n`,
    'utf8'
  )
  console.log(`✓ ${records.length} unieke Siemens-nummers verdeeld over ${batches.length} batches van maximaal ${batchSize}.`)
  console.log(outputDirectory)
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
