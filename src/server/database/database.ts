import { Companies, Invoices, Job, Jobs, Users, BannedUsers, Prestation } from '../../types/index.js'
import { DataStore } from './store.js'
import { opendir, mkdir } from 'fs/promises'

try {
  const dirent = await opendir('./.database/invoices')
  await dirent.close()
} catch (error) {
  await mkdir('./.database/invoices', { recursive: true })
}

export const jobsStore = new DataStore('jobs')
export const companiesStore = new DataStore('companies')
export const invoicesStore = new DataStore('invoices')
export const usersStore = new DataStore('users')
export const bannedUsersStore = new DataStore('bannedUsers')
// export const hoursStore = new DataStore('hours')

const year = new Date().getFullYear()

let promises: Promise<any>[] = [
  jobsStore.get(),
  companiesStore.get(),
  invoicesStore.get(),
  usersStore.get(),
  bannedUsersStore.get()
  // hoursStore.get()
]
promises = await Promise.all(promises)

export const jobs = promises[0] as unknown as Jobs

export const companies = promises[1] as unknown as Companies
export const invoices = promises[2] as unknown as Invoices
export const users = promises[3] as unknown as Users
export const bannedUsers = promises[4] as unknown as BannedUsers
// export const hours = promises[5] as unknown as { [date: string]: Prestation }
