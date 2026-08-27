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
  const requestedTarget = args.slice(1).find((argument) => !argument.startsWith('-')) || 'all'
  const targetArg = requestedTarget === 'allelek' ? 'alelek' : requestedTarget

  if (!['all', 'desco', 'alelek'].includes(targetArg)) {
    throw new Error(`Unknown sync target: ${requestedTarget}. Use all, desco or alelek.`)
  }

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
  console.log(
    '       keepit images [all|desco|alelek] [--concurrency=2] [--limit=1000] [--provider=techlink] [--allow-failures] [--repair-failures|--retry-failures]'
  )
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

const createTerminalSpinner = () => {
  const frames = ['|', '/', '-', '\\']
  let frame = 0
  let message = ''
  let timer: ReturnType<typeof setInterval> | undefined
  const interactive = Boolean(process.stdout.isTTY)

  const render = (): void => {
    const width = Math.max(20, (process.stdout.columns || 120) - 1)
    const line = `${frames[frame++ % frames.length]} ${message}`.slice(0, width)
    process.stdout.write(`\r\x1b[2K${line}`)
  }

  return {
    update(nextMessage: string): void {
      message = nextMessage
      if (!interactive) return
      render()
      if (!timer) {
        timer = setInterval(render, 100)
        timer.unref()
      }
    },
    finish(finalMessage: string): void {
      if (timer) clearInterval(timer)
      timer = undefined
      if (interactive) {
        process.stdout.write(`\r\x1b[2K${finalMessage}\n`)
      } else {
        console.log(finalMessage)
      }
    },
    clear(): void {
      if (timer) clearInterval(timer)
      timer = undefined
      if (interactive) process.stdout.write('\r\x1b[2K')
    }
  }
}

const runAlelekSync = async (force: boolean, scraper: boolean): Promise<void> => {
  if (!force && !(await shouldSyncAlelek())) {
    console.log('Alelek: skipped (synced within 7 days). Use --force to bypass.')
    return
  }

  try {
    let partial = false
    let categoryActive = false
    const spinner = scraper ? createTerminalSpinner() : undefined
    console.log(`Alelek: ${scraper ? 'scraper starten' : 'catalogusfeed ophalen'}…`)
    try {
      const catalog = scraper
        ? await syncAlelekCatalogViaScraperWithTracking(undefined, (progress) => {
            if (progress.stage === 'status') {
              if (!categoryActive) spinner?.update(progress.message)
            } else if (progress.stage === 'category') {
              categoryActive = true
              spinner?.update(`[${progress.category}]: pagina[-/-] - products [0/-]`)
            } else if (progress.stage === 'category-complete') {
              categoryActive = false
              spinner?.finish(
                `✓ [${progress.category}]: pagina[${progress.pages}/${progress.pages}] - products [${progress.products}/${progress.products}]`
              )
            } else if (progress.stage === 'pause') {
              const minutes = Math.floor(progress.remainingSeconds / 60)
              const seconds = String(progress.remainingSeconds % 60).padStart(2, '0')
              spinner?.update(
                `[${progress.category}]: pauze[${minutes}:${seconds}] - pagina[${progress.page}/${progress.totalPages}] - products [${progress.processed}/${progress.expected}]`
              )
            } else if (progress.stage === 'page') {
              spinner?.update(
                `[${progress.category}]: pagina[${progress.page}/${progress.totalPages}] - products [${progress.processed}/${progress.expected}]`
              )
            } else {
              partial = progress.partial
              spinner?.finish(
                `${progress.partial ? 'Gedeeltelijke scan' : 'Scan volledig'}: ${progress.cached} producten · ${progress.completedCategories}/${progress.totalCategories} categorieën`
              )
            }
          })
        : await syncAlelekCatalogWithTracking()
      console.log(`${partial ? '↻ Alelek gedeeltelijk' : '✓ Alelek'}: ${catalog.count} items (${catalog.updatedAt})`)
    } finally {
      spinner?.clear()
    }
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
  const source: ProductImageSource = sourceArg === 'desco' || sourceArg === 'alelek' ? sourceArg : 'all'
  const concurrencyArgument = args.find((argument) => argument.startsWith('--concurrency='))
  const concurrency = Math.max(1, Math.min(6, Number(concurrencyArgument?.split('=')[1]) || 2))
  const limitArgument = args.find((argument) => argument.startsWith('--limit='))
  const parsedLimit = Number(limitArgument?.split('=')[1])
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : undefined
  const retryFailures = args.includes('--retry-failures')
  const repairFailures = args.includes('--repair-failures')
  const providerArgument = args.find((argument) => argument.startsWith('--provider='))
  const provider = providerArgument?.split('=')[1]?.trim() || undefined
  const allowFailures = args.includes('--allow-failures')
  let lastPrinted = 0

  console.log(
    `Productbeelden voorbereiden: ${source}${provider ? `, provider ${provider}` : ''}, ${concurrency} gelijktijdige downloads${limit ? `, maximaal ${limit}` : ''}…`
  )
  const report = await cacheCatalogImages(
    source,
    concurrency,
    (progress) => {
      if (progress.completed === progress.total || progress.completed - lastPrinted >= 100) {
        lastPrinted = progress.completed
        console.log(`  ${progress.completed}/${progress.total} verwerkt · ${progress.failed.length} mislukt`)
      }
    },
    { limit, retryFailures, repairFailures, provider }
  )

  console.log(`  ${report.alreadyCached}/${report.catalogTotal} bronnen waren al volledig lokaal gecachet`)
  if (report.deferred) console.log(`  ${report.deferred} gekende defecte bronnen voorlopig overgeslagen`)
  console.log(`✓ ${report.completed - report.failed.length}/${report.total} ontbrekende bronnen succesvol verwerkt`)
  if (report.failed.length) {
    console.warn(`⚠ ${report.failed.length} bronbeelden konden niet verwerkt worden:`)
    report.failed.slice(0, 20).forEach(({ url, error }) => console.warn(`  ${url} — ${error}`))
    if (report.failed.length > 20) console.warn(`  … en nog ${report.failed.length - 20}`)
    if (!allowFailures) process.exitCode = 1
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
