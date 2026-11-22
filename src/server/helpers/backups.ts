import { copyFile, mkdir, readFile, readdir, rename, stat, unlink } from 'fs/promises'
import { basename, dirname, resolve } from 'path'
import { databaseRoot, databasePath } from './paths.js'
import { restoreGuard } from './restore-guard.js'
import { writeBackupArchive } from './backup-archive.js'

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
  'quotes',
  'appSettings'
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
  includesAttachments: boolean
}

const backupRoot = process.env.KEEPIT_BACKUP_DIR ? resolve(process.env.KEEPIT_BACKUP_DIR) : resolve(databaseRoot, 'backups')
const configuredMirrorRoot = process.env.KEEPIT_BACKUP_MIRROR_DIR?.trim()
const backupMirrorRoot = configuredMirrorRoot ? resolve(configuredMirrorRoot) : undefined
export const backupMirrorEnabled = Boolean(backupMirrorRoot && backupMirrorRoot !== backupRoot)
const backupNamePattern = /^keepit-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(automatic|manual|pre-restore)\.(json|tar)$/
const configuredRetention = Number(process.env.KEEPIT_BACKUP_RETENTION)
export const automaticRetention = Number.isInteger(configuredRetention) && configuredRetention > 0
  ? configuredRetention
  : 30
const manualRetention = 10
let activeBackup: Promise<BackupSummary> | undefined
let scheduledBackup: ReturnType<typeof setTimeout> | undefined
let lastAutomaticArchive = 0
const automaticArchiveInterval = 60 * 60_000

const safeTimestamp = (date: Date) => date.toISOString().replaceAll(':', '-').replaceAll('.', '-')

const atomicBackupWrite = async (file: string, write: (temporary: string) => Promise<void>) => {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await write(temporary)
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

const readDataset = async (name: BackupDataset): Promise<Record<string, unknown>> => {
  try {
    const parsed = JSON.parse(await readFile(databasePath(`${name}.json`), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Gegevensset ${name} heeft geen geldig gegevensformaat`)
    }
    return parsed
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
  // Backups created before global app settings existed remain restorable.
  if (!Object.hasOwn(candidate.datasets, 'appSettings')) candidate.datasets.appSettings = {}
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
  return { id, createdAt: backup.createdAt, reason: backup.reason, sizeBytes: metadata.size, includesAttachments: false }
}

export const getBackupSummary = async (id: string): Promise<BackupSummary> => {
  const file = resolveBackupFile(id)
  if (!id.endsWith('.tar')) return summaryFor(id)
  const [, timestamp, reason] = id.match(backupNamePattern)!
  const createdAt = timestamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d\d\d)Z$/, 'T$1:$2:$3.$4Z')
  return { id, createdAt, reason: reason as BackupReason, sizeBytes: (await stat(file)).size, includesAttachments: true }
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

  if (backupMirrorEnabled && backupMirrorRoot) {
    await mkdir(backupMirrorRoot, { recursive: true })
    const names = (await readdir(backupMirrorRoot)).filter((name) => backupNamePattern.test(name)).sort().reverse()
    const removeMirrorOverflow = async (reason: BackupReason, keep: number) => {
      const overflow = names.filter((name) => name.match(backupNamePattern)?.[2] === reason).slice(keep)
      await Promise.all(overflow.map((name) => unlink(resolve(backupMirrorRoot, name)).catch(() => undefined)))
    }
    await Promise.all([
      removeMirrorOverflow('automatic', automaticRetention),
      removeMirrorOverflow('manual', manualRetention),
      removeMirrorOverflow('pre-restore', manualRetention)
    ])
  }
}

export const resolveBackupFile = (id: string) => {
  const safeId = basename(id)
  if (safeId !== id || !backupNamePattern.test(safeId)) throw new Error('Ongeldige back-upnaam')
  return resolve(backupRoot, safeId)
}

export const validateBackup = (value: unknown) => parseBackup(value)

export async function captureBackup(reason: BackupReason): Promise<KeepitBackup> {
  const entries = await Promise.all(BACKUP_DATASETS.map(async (name) => [name, await readDataset(name)] as const))
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), reason,
    datasets: Object.fromEntries(entries) as KeepitBackup['datasets']
  }
}

const createBackupFile = async (reason: BackupReason, snapshot?: KeepitBackup): Promise<BackupSummary> => {
  if (activeBackup) {
    await activeBackup.catch(() => undefined)
    return createBackupFile(reason, snapshot)
  }
  activeBackup = (async () => {
    const backup = snapshot ?? await captureBackup(reason)
    const id = `keepit-backup-${safeTimestamp(new Date(backup.createdAt))}-${reason}.tar`
    const file = resolveBackupFile(id)
    await atomicBackupWrite(file, (temporary) => writeBackupArchive(temporary, databaseRoot, backup))
    if (backupMirrorEnabled && backupMirrorRoot) await atomicBackupWrite(resolve(backupMirrorRoot, id), (temporary) => copyFile(file, temporary))
    const result = await getBackupSummary(id)
    if (reason === 'automatic') lastAutomaticArchive = Date.parse(result.createdAt)
    await rotate()
    return result
  })()
  try {
    return await activeBackup
  } finally {
    activeBackup = undefined
  }
}

export const createBackup = async (reason: BackupReason = 'manual', snapshot?: KeepitBackup): Promise<BackupSummary> => {
  if (reason === 'pre-restore') return createBackupFile(reason, snapshot)
  const leave = restoreGuard.enterRequest()
  if (!leave) throw new Error('Er loopt een back-upherstel.')
  try {
    return await createBackupFile(reason)
  } finally {
    leave()
  }
}

export const listBackups = async (): Promise<BackupSummary[]> => {
  await mkdir(backupRoot, { recursive: true })
  const names = (await readdir(backupRoot)).filter((name) => backupNamePattern.test(name))
  const summaries = await Promise.all(names.map((name) => getBackupSummary(name).catch(() => undefined)))
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
  }, Math.max(5000, lastAutomaticArchive + automaticArchiveInterval - Date.now()))
  scheduledBackup.unref?.()
}

export const startAutomaticBackups = async () => {
  const latestAutomatic = (await listBackups()).find((item) => item.reason === 'automatic' && item.includesAttachments)
  lastAutomaticArchive = latestAutomatic ? Date.parse(latestAutomatic.createdAt) : 0
  if (!latestAutomatic || Date.now() - Date.parse(latestAutomatic.createdAt) > 24 * 60 * 60 * 1000) {
    await createBackup('automatic')
  }
  const interval = setInterval(() => void createBackup('automatic').catch((error) => {
    console.error('Automatic backup failed:', error instanceof Error ? error.message : String(error))
  }), 24 * 60 * 60 * 1000)
  interval.unref?.()
}
