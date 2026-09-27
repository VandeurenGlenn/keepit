import {
  Companies,
  Invoices,
  Jobs,
  Users,
  BannedUsers,
  Hours,
  Invites,
  MediaAssets,
  ShopOrders,
  TimelinePlaceCache,
  TimelineLocationEvents,
  TimelineTrackingStates,
  PlanningEntries,
  AppNotifications,
  Quotes,
  AppSettings
} from '../../types/index.js'
import { DataStore } from './store.js'
import { opendir, mkdir } from 'fs/promises'
import { databasePath } from '../helpers/paths.js'

try {
  const dirent = await opendir(databasePath('invoices'))
  await dirent.close()
} catch (error) {
  await mkdir(databasePath('invoices'), { recursive: true })
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
export const timelineLocationsStore = new DataStore('timelineLocations')
export const timelineTrackingStatesStore = new DataStore('timelineTrackingStates')
export const timelinePlaceCacheStore = new DataStore('timelinePlaceCache')
export const planningStore = new DataStore('planning')
export const notificationsStore = new DataStore('notifications')
export const quotesStore = new DataStore('quotes')
export const appSettingsStore = new DataStore('appSettings')

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
  shopOrdersStore.get(),
  timelineLocationsStore.get(),
  timelineTrackingStatesStore.get(),
  timelinePlaceCacheStore.get(),
  planningStore.get(),
  notificationsStore.get(),
  quotesStore.get(),
  appSettingsStore.get()
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
export const timelineLocations = promises[9] as unknown as TimelineLocationEvents
export const timelineTrackingStates = promises[10] as unknown as TimelineTrackingStates
export const timelinePlaceCache = promises[11] as unknown as TimelinePlaceCache
export const planning = promises[12] as unknown as PlanningEntries
export const notifications = promises[13] as unknown as AppNotifications
export const quotes = promises[14] as unknown as Quotes
export const appSettings = promises[15] as unknown as AppSettings

export const operationalData = {
  jobs, companies, invoices, media, users, bannedUsers, hours, invites, shopOrders,
  timelineLocations, timelineTrackingStates, timelinePlaceCache, planning, notifications, quotes, appSettings
}

export const operationalStores = {
  jobs: jobsStore,
  companies: companiesStore,
  invoices: invoicesStore,
  media: mediaStore,
  users: usersStore,
  bannedUsers: bannedUsersStore,
  hours: hoursStore,
  invites: invitesStore,
  shopOrders: shopOrdersStore,
  timelineLocations: timelineLocationsStore,
  timelineTrackingStates: timelineTrackingStatesStore,
  timelinePlaceCache: timelinePlaceCacheStore,
  planning: planningStore,
  notifications: notificationsStore,
  quotes: quotesStore,
  appSettings: appSettingsStore
}

let workSessionMetadataMigrated = false
for (const [userId, userHours] of Object.entries(hours)) {
  for (const prestation of Object.values(userHours)) {
    if (!prestation.source || prestation.source === 'legacy') {
      // Before source metadata existed, work sessions could only be created by the explicit check-in endpoint.
      prestation.source = 'manual'
      workSessionMetadataMigrated = true
    }
  }
  const user = users[userId]
  if (user?.currentJob && !user.currentPrestationId) {
    const openId = [...(jobs[user.currentJob]?.hours?.[userId] || [])].reverse().find((id) => {
      const prestation = userHours[id]
      return prestation && !prestation.checkout
    })
    if (openId) {
      user.currentPrestationId = openId
      workSessionMetadataMigrated = true
    }
  }
}
if (workSessionMetadataMigrated) await Promise.all([hoursStore.put(hours), usersStore.put(users)])

// `invited` describes a pending invitation in the team UI. Older registrations
// kept this flag after activation, making fully registered employees look pending.
let registrationStatusMigrated = false
for (const user of Object.values(users)) {
  if (user.invited !== true) continue
  user.invited = false
  registrationStatusMigrated = true
}
if (registrationStatusMigrated) await usersStore.put(users)

const registeredEmails = new Set(
  Object.values(users)
    .map((user) => user.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email))
)
let staleInvitesRemoved = false
for (const [inviteId, invite] of Object.entries(invites)) {
  if (!registeredEmails.has(invite.email?.trim().toLowerCase())) continue
  delete invites[inviteId]
  staleInvitesRemoved = true
}
if (staleInvitesRemoved) await invitesStore.put(invites)

const legacySupplierPattern = /^(facq|tecmine)(\s|$)/i
let relationshipsMigrated = false
for (const company of Object.values(companies)) {
  if (company.relationshipType) continue
  company.relationshipType = legacySupplierPattern.test(company.name.trim()) ? 'supplier' : 'customer'
  relationshipsMigrated = true
}
if (relationshipsMigrated) await companiesStore.put(companies)
