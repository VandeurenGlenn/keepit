#!/usr/bin/env node

import { syncDescoCatalogWithTracking } from './helpers/desco.js'
import { syncAlelekCatalogWithTracking, syncAlelekCatalogViaScraperWithTracking } from './helpers/alelek.js'
import { shouldSyncAlelek, shouldSyncDesco } from './helpers/sync-tracker.js'

type CliOptions = {
  target: 'all' | 'desco' | 'alelek'
  force: boolean
  scraper: boolean
}

const parseOptions = (argv: string[]): CliOptions => {
  const args = argv.slice(2)
  const command = args[0] || ''
  const targetArg = args[1] || 'all'

  if (command !== 'sync') {
    return {
      target: 'all',
      force: false,
      scraper: true
    }
  }

  const target = targetArg === 'desco' || targetArg === 'alelek' ? targetArg : 'all'
  const force = args.includes('--force') || args.includes('-f')
  const scraper = !args.includes('--no-scraper')

  return {
    target,
    force,
    scraper
  }
}

const printUsage = (): void => {
  console.log('Usage: keepit sync [all|desco|alelek] [--force] [--no-scraper]')
  console.log('Examples:')
  console.log('  keepit sync')
  console.log('  keepit sync desco --force')
  console.log('  keepit sync alelek --force --no-scraper')
}

const runDescoSync = async (force: boolean): Promise<void> => {
  if (!force && !(await shouldSyncDesco())) {
    console.log('Desco: skipped (synced within 7 days). Use --force to bypass.')
    return
  }

  const catalog = await syncDescoCatalogWithTracking()
  console.log(`Desco: synced ${catalog.count} items (${catalog.updatedAt})`)
}

const runAlelekSync = async (force: boolean, scraper: boolean): Promise<void> => {
  if (!force && !(await shouldSyncAlelek())) {
    console.log('Alelek: skipped (synced within 7 days). Use --force to bypass.')
    return
  }

  const catalog = scraper ? await syncAlelekCatalogViaScraperWithTracking() : await syncAlelekCatalogWithTracking()
  console.log(`Alelek: synced ${catalog.count} items (${catalog.updatedAt})`)
}

const run = async (): Promise<void> => {
  const argv = process.argv
  const command = argv[2]
  const args = argv.slice(3)

  if (!command || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command !== 'sync') {
    printUsage()
    process.exitCode = 1
    return
  }

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return
  }

  const options = parseOptions(argv)

  try {
    if (options.target === 'all' || options.target === 'desco') {
      await runDescoSync(options.force)
    }

    if (options.target === 'all' || options.target === 'alelek') {
      await runAlelekSync(options.force, options.scraper)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Sync failed: ${message}`)
    process.exitCode = 1
  }
}

void run()
