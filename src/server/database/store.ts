import pubsub from './../helpers/pubsub.js'
import { mkdir, rename, unlink, writeFile } from 'fs/promises'
import { dirname, parse } from 'path'
import { scheduleAutomaticBackup } from '../helpers/backups.js'
import { databasePath } from '../helpers/paths.js'
import { readJsonFile } from './json-file.js'

export const write = async (file: string, data: any) => {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), 'utf-8')
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

export const read = readJsonFile

export class DataStore {
  private busy = false
  private queue: any[] = []
  private file: string
  private storageType: string

  constructor(file: string, storageType?: 'Array' | 'Object') {
    this.file = file
    this.storageType = storageType || 'Object'
  }

  public async put(data: any, options?: { silent?: boolean }) {
    return new Promise((resolve, reject) => {
      this.queue.push({ type: 'write', data, resolve, reject, silent: options?.silent })
      this.runQueue()
    })
  }
  public async get() {
    return new Promise((resolve, reject) => {
      this.queue.push({ type: 'read', resolve, reject })
      this.runQueue()
    })
  }

  private async runQueue() {
    if (this.busy) {
      return
    }
    this.busy = true
    try {
      while (this.queue.length) await this.processQueue()
    } finally {
      this.busy = false
    }
  }

  private async processQueue() {
    const { type, data, resolve, reject, silent } = this.queue.shift()!
    try {
      if (type === 'update' || type === 'write') {
        await write(databasePath(`${this.file}.json`), data)
        resolve()
        if (!silent) scheduleAutomaticBackup()
        console.log(`Data written to ${databasePath(`${this.file}.json`)}`)
        if (!silent) pubsub.publish(`${parse(this.file).name}.changed`, data)
      } else if (type === 'read') {
        const stored = await read(databasePath(`${this.file}.json`))
        if (stored === undefined) {
          if (this.storageType === 'Array') {
            resolve([])
          } else {
            resolve({})
          }
        } else {
          resolve(stored)
        }
      }
    } catch (error) {
      reject(error)
    }
  }
}
