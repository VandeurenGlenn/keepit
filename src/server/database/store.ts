import { mkdir, opendir, readFile, writeFile } from 'fs/promises'

export const write = async (file: string, data: any) => {
  await writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
}

export const read = async (file: string) => {
  let data
  try {
    data = JSON.parse(await readFile(file, 'utf-8'))
  } catch (error) {
    data = {}
  }

  return data
}

export class DataStore {
  private busy = false
  private queue: any[] = []
  private file: string
  private storageType: string

  constructor(file: string, storageType?: 'Array' | 'Object') {
    this.file = file
    this.storageType = storageType || 'Object'
  }

  public async put(data: any) {
    return new Promise((resolve) => {
      this.queue.push({ type: 'write', data, resolve })
      this.runQueue()
    })
  }
  public async get() {
    return new Promise((resolve) => {
      this.queue.push({ type: 'read', resolve })
      this.runQueue()
    })
  }

  private async runQueue() {
    if (this.busy) {
      return
    }
    this.busy = true
    await this.processQueue()
    this.busy = false
  }

  private async processQueue() {
    const { type, data, resolve } = this.queue.shift()!
    if (type === 'update' || type === 'write') {
      await write(`./.database/${this.file}.json`, data)
      resolve()
    } else if (type === 'read') {
      const data = await read(`./.database/${this.file}.json`)
      if (!data) {
        if (this.storageType === 'Array') {
          resolve([])
        } else {
          resolve({})
        }
      } else {
        resolve(data)
      }
    }
    if (this.queue.length > 0) {
      return this.processQueue()
    }
  }
}
