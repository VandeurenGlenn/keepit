#!/usr/bin/env node

import { enrichDescoCatalog, syncDescoCatalogWithTracking } from './helpers/desco.js'
import { syncAlelekCatalogWithTracking, syncAlelekCatalogViaScraperWithTracking } from './helpers/alelek.js'
import { shouldSyncAlelek, shouldSyncDesco } from './helpers/sync-tracker.js'
import { cacheCatalogImages, type ProductImageSource } from './helpers/product-images.js'

type CliOptions = {
  command: 'sync' | 'enrich'
  target: 'all' | 'desco' | 'alelek'
  force: boolean
  scraper: boolean
}

const parseOptions = (argv: string[]): CliOptions => {
  const args = argv.slice(2)
  const command = args[0] === 'enrich' ? 'enrich' : 'sync'
  const targetArg = args.slice(1).find((argument) => ['all', 'desco', 'alelek'].includes(argument)) || 'all'

  if (command === 'enrich') {
    const target = targetArg === 'desco' ? 'desco' : 'desco'

    return {
      command,
      target,
      force: false,
      scraper: true
    }
  }

  const target = targetArg === 'desco' || targetArg === 'alelek' ? targetArg : 'all'
  const force = args.includes('--force') || args.includes('-f')
  const scraper = !args.includes('--no-scraper')

  return {
    command,
    target,
    force,
    scraper
  }
}

const printUsage = (): void => {
  console.log('Usage: keepit sync [all|desco|alelek] [--force] [--no-scraper]')
  console.log('       keepit enrich [desco]')
  console.log('       keepit images [all|desco|alelek] [--concurrency=2]')
  console.log('Examples:')
  console.log('  keepit sync')
  console.log('  keepit sync desco --force')
  console.log('  keepit sync alelek --force --no-scraper')
  console.log('  keepit enrich desco')
  console.log('  keepit images all')
  console.log('  keepit images alelek --concurrency=2')
}

const runDescoSync = async (force: boolean): Promise<void> => {
  if (!force && !(await shouldSyncDesco())) {
    console.log('Desco: skipped (synced within 7 days). Use --force to bypass.')
    return
  }

  try {
    const catalog = await syncDescoCatalogWithTracking()
    console.log(`✓ Desco: ${catalog.count} items (${catalog.updatedAt})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Desco sync failed: ${message}`)
  }
}

const runAlelekSync = async (force: boolean, scraper: boolean): Promise<void> => {
  if (!force && !(await shouldSyncAlelek())) {
    console.log('Alelek: skipped (synced within 7 days). Use --force to bypass.')
    return
  }

  try {
    console.log(`Alelek: ${scraper ? 'scraper starten' : 'catalogusfeed ophalen'}…`)
    const catalog = scraper
      ? await syncAlelekCatalogViaScraperWithTracking(undefined, (progress) => {
          if (progress.stage === 'category') {
            console.log(`  [${progress.index}/${progress.total}] ${progress.category}: resultaten laden en scrollen…`)
          } else if (progress.stage === 'discovered') {
            console.log(
              `  ${progress.category}: ${progress.found} gevonden · ${progress.pending} nog te bezoeken${
                progress.footerReached ? ' · footer bereikt' : ''
              }`
            )
          } else if (progress.stage === 'product') {
            console.log(
              `  [${progress.completed}/${progress.maximum}] ${progress.name} · ${progress.cached} producten opgeslagen`
            )
          } else if (progress.stage === 'rest') {
            console.log(`  Rustpauze ${progress.seconds}s na ${progress.completed} producten…`)
          } else {
            console.log(
              `  Scraper klaar: ${progress.cached} producten · ${progress.completedCategories}/${progress.totalCategories} categorieën`
            )
          }
        })
      : await syncAlelekCatalogWithTracking()
    console.log(`✓ Alelek: ${catalog.count} items (${catalog.updatedAt})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Alelek sync failed: ${message}`)
  }
}

const runDescoEnrich = async (): Promise<void> => {
  try {
    const catalog = await enrichDescoCatalog()
    console.log(`✓ Desco enriched: ${catalog.count} items (${catalog.updatedAt})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Desco enrichment failed: ${message}`)
  }
}

const runImageCache = async (args: string[]): Promise<void> => {
  const sourceArg = args.find((argument) => !argument.startsWith('-')) || 'all'
  const source: ProductImageSource =
    sourceArg === 'desco' || sourceArg === 'alelek' ? sourceArg : 'all'
  const concurrencyArgument = args.find((argument) => argument.startsWith('--concurrency='))
  const concurrency = Math.max(1, Math.min(6, Number(concurrencyArgument?.split('=')[1]) || 2))
  let lastPrinted = 0

  console.log(`Productbeelden voorbereiden: ${source}, ${concurrency} gelijktijdige downloads…`)
  const report = await cacheCatalogImages(source, concurrency, (progress) => {
    if (progress.completed === progress.total || progress.completed - lastPrinted >= 25) {
      lastPrinted = progress.completed
      console.log(`  ${progress.completed}/${progress.total} verwerkt · ${progress.failed.length} mislukt`)
    }
  })

  console.log(`✓ ${report.completed - report.failed.length}/${report.total} productbeelden volledig gecachet`)
  if (report.failed.length) {
    console.warn(`⚠ ${report.failed.length} bronbeelden konden niet verwerkt worden:`)
    report.failed.slice(0, 20).forEach(({ url, error }) => console.warn(`  ${url} — ${error}`))
    if (report.failed.length > 20) console.warn(`  … en nog ${report.failed.length - 20}`)
    process.exitCode = 1
  }
}

const run = async (): Promise<void> => {
  const argv = process.argv
  const command = argv[2]
  const args = argv.slice(3)

  if (!command || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command !== 'sync' && command !== 'enrich' && command !== 'images') {
    printUsage()
    process.exitCode = 1
    return
  }

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return
  }

  try {
    if (command === 'images') {
      await runImageCache(args)
      return
    }

    const options = parseOptions(argv)
    if (options.command === 'enrich') {
      await runDescoEnrich()
      return
    }

    if (options.target === 'all' || options.target === 'desco') {
      await runDescoSync(options.force)
    }

    if (options.target === 'all' || options.target === 'alelek') {
      await runAlelekSync(options.force, options.scraper)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`✗ ${message}`)
    process.exitCode = 1
  }
}

void run()
