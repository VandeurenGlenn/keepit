import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises'
import { basename, resolve } from 'path'

export const BACKUP_FORMAT = 'keepit-backup'
export const BACKUP_VERSION = 1
export const BACKUP_DATASETS = [
  'jobs',
  'companies',
  'invoices',
  'media',
  'users',
  'bannedUsers',
  'hours',
  'invites',
  'shopOrders',
  'timelineLocations',
  'timelineTrackingStates',
  'timelinePlaceCache',
  'planning',
  'notifications',
  'quotes'
] as const

export type BackupDataset = (typeof BACKUP_DATASETS)[number]
export type BackupReason = 'automatic' | 'manual' | 'pre-restore'

export interface KeepitBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  createdAt: string
  reason: BackupReason
  datasets: Record<BackupDataset, Record<string, unknown>>
}

export interface BackupSummary {
  id: string
  createdAt: string
  reason: BackupReason
  sizeBytes: number
}

const databaseRoot = resolve('.database')
const backupRoot = process.env.KEEPIT_BACKUP_DIR ? resolve(process.env.KEEPIT_BACKUP_DIR) : resolve(databaseRoot, 'backups')
const backupNamePattern = /^keepit-backup-[0-9TZ-]+-(automatic|manual|pre-restore)\.json$/
const configuredRetention = Number(process.env.KEEPIT_BACKUP_RETENTION)
export const automaticRetention = Number.isInteger(configuredRetention) && configuredRetention > 0
  ? configuredRetention
  : 30
const manualRetention = 10
let activeBackup: Promise<BackupSummary> | undefined
let scheduledBackup: ReturnType<typeof setTimeout> | undefined

const safeTimestamp = (date: Date) => date.toISOString().replaceAll(':', '-').replaceAll('.', '-')

const atomicJsonWrite = async (file: string, value: unknown) => {
  await mkdir(backupRoot, { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

const readDataset = async (name: BackupDataset): Promise<Record<string, unknown>> => {
  try {
    const parsed = JSON.parse(await readFile(resolve(databaseRoot, `${name}.json`), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

const parseBackup = (value: unknown): KeepitBackup => {
  if (!value || typeof value !== 'object') throw new Error('Ongeldig back-upbestand')
  const candidate = value as Partial<KeepitBackup>
  if (candidate.format !== BACKUP_FORMAT || candidate.version !== BACKUP_VERSION) {
    throw new Error('Dit back-upformaat wordt niet ondersteund')
  }
  if (!candidate.createdAt || !Number.isFinite(Date.parse(candidate.createdAt))) {
    throw new Error('De aanmaakdatum van de back-up ontbreekt')
  }
  if (!candidate.datasets || typeof candidate.datasets !== 'object' || Array.isArray(candidate.datasets)) {
    throw new Error('De gegevens in de back-up ontbreken')
  }
  for (const name of BACKUP_DATASETS) {
    const dataset = candidate.datasets[name]
    if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
      throw new Error(`Gegevensset ${name} ontbreekt of is ongeldig`)
    }
    for (const key of Object.keys(dataset)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error(`Gegevensset ${name} bevat een onveilige sleutel`)
      }
    }
  }
  return candidate as KeepitBackup
}

const summaryFor = async (id: string): Promise<BackupSummary> => {
  const file = resolveBackupFile(id)
  const [metadata, contents] = await Promise.all([stat(file), readFile(file, 'utf8')])
  const backup = parseBackup(JSON.parse(contents))
  return { id, createdAt: backup.createdAt, reason: backup.reason, sizeBytes: metadata.size }
}

const rotate = async () => {
  const summaries = await listBackups()
  const removeOverflow = async (reason: BackupReason, keep: number) => {
    const overflow = summaries.filter((item) => item.reason === reason).slice(keep)
    await Promise.all(overflow.map((item) => unlink(resolveBackupFile(item.id)).catch(() => undefined)))
  }
  await Promise.all([
    removeOverflow('automatic', automaticRetention),
    removeOverflow('manual', manualRetention),
    removeOverflow('pre-restore', manualRetention)
  ])
}

export const resolveBackupFile = (id: string) => {
  const safeId = basename(id)
  if (safeId !== id || !backupNamePattern.test(safeId)) throw new Error('Ongeldige back-upnaam')
  return resolve(backupRoot, safeId)
}

export const validateBackup = (value: unknown) => parseBackup(value)

export const createBackup = async (reason: BackupReason = 'manual'): Promise<BackupSummary> => {
  if (activeBackup) {
    await activeBackup
    return createBackup(reason)
  }
  activeBackup = (async () => {
    const createdAt = new Date().toISOString()
    const entries = await Promise.all(BACKUP_DATASETS.map(async (name) => [name, await readDataset(name)] as const))
    const backup: KeepitBackup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt,
      reason,
      datasets: Object.fromEntries(entries) as KeepitBackup['datasets']
    }
    const id = `keepit-backup-${safeTimestamp(new Date(createdAt))}-${reason}.json`
    await atomicJsonWrite(resolve(backupRoot, id), backup)
    const result = await summaryFor(id)
    await rotate()
    return result
  })()
  try {
    return await activeBackup
  } finally {
    activeBackup = undefined
  }
}

export const listBackups = async (): Promise<BackupSummary[]> => {
  await mkdir(backupRoot, { recursive: true })
  const names = (await readdir(backupRoot)).filter((name) => backupNamePattern.test(name))
  const summaries = await Promise.all(names.map((name) => summaryFor(name).catch(() => undefined)))
  return summaries
    .filter((item): item is BackupSummary => Boolean(item))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

export const readBackup = async (id: string): Promise<KeepitBackup> => {
  return parseBackup(JSON.parse(await readFile(resolveBackupFile(id), 'utf8')))
}

export const scheduleAutomaticBackup = () => {
  if (scheduledBackup) clearTimeout(scheduledBackup)
  scheduledBackup = setTimeout(() => {
    scheduledBackup = undefined
    void createBackup('automatic').catch((error) => {
      console.error('Automatic backup failed:', error instanceof Error ? error.message : String(error))
    })
  }, 5_000)
  scheduledBackup.unref?.()
}

export const startAutomaticBackups = async () => {
  const latestAutomatic = (await listBackups()).find((item) => item.reason === 'automatic')
  if (!latestAutomatic || Date.now() - Date.parse(latestAutomatic.createdAt) > 24 * 60 * 60 * 1000) {
    await createBackup('automatic')
  }
  const interval = setInterval(() => void createBackup('automatic'), 24 * 60 * 60 * 1000)
  interval.unref?.()
}
