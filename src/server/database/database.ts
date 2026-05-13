import {
  Companies,
  Invoices,
  Jobs,
  Users,
  BannedUsers,
  Hours,
  Invites,
  MediaAssets,
  ShopOrders
} from '../../types/index.js'
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
export const mediaStore = new DataStore('media')
export const usersStore = new DataStore('users')
export const bannedUsersStore = new DataStore('bannedUsers')
export const hoursStore = new DataStore('hours')
export const invitesStore = new DataStore('invites')
export const shopOrdersStore = new DataStore('shopOrders')

const year = new Date().getFullYear()

let promises: Promise<any>[] = [
  jobsStore.get(),
  companiesStore.get(),
  invoicesStore.get(),
  mediaStore.get(),
  usersStore.get(),
  bannedUsersStore.get(),
  hoursStore.get(),
  invitesStore.get(),
  shopOrdersStore.get()
]
promises = await Promise.all(promises)

export const jobs = promises[0] as unknown as Jobs
export const companies = promises[1] as unknown as Companies
export const invoices = promises[2] as unknown as Invoices
export const media = promises[3] as unknown as MediaAssets
export const users = promises[4] as unknown as Users
export const bannedUsers = promises[5] as unknown as BannedUsers
export const hours = promises[6] as unknown as Hours
export const invites = promises[7] as unknown as Invites
export const shopOrders = promises[8] as unknown as ShopOrders
