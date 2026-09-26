import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const configuredDataDirectory = process.env.KEEPIT_DATA_DIR?.trim()

export const databaseRoot = configuredDataDirectory
  ? resolve(configuredDataDirectory)
  : join(homedir(), 'keepit', '.database')

export const databasePath = (...segments) => join(databaseRoot, ...segments)
