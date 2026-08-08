import { users, usersStore } from '../database/database.js'
import { config } from './config.js'

type OwnerConfig = {
  owner?: {
    email?: string
  }
  ownerEmail?: string
}

const normalizeEmail = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()

export const getConfiguredOwnerEmail = (): string => {
  const fromEnv = normalizeEmail(process.env.KEEPIT_OWNER_EMAIL)
  if (fromEnv) return fromEnv

  const ownerConfig = config as OwnerConfig
  const fromObject = normalizeEmail(ownerConfig.owner?.email)
  if (fromObject) return fromObject

  return normalizeEmail(ownerConfig.ownerEmail)
}

const dedupeRoles = (roles: string[] = []): string[] => Array.from(new Set(roles))

export const reconcileOwnerRoles = async (): Promise<void> => {
  const configuredOwnerEmail = getConfiguredOwnerEmail()
  if (!configuredOwnerEmail) return

  const hasConfiguredOwnerAccount = Object.values(users).some((user) => {
    const userEmails = [normalizeEmail(user.email), normalizeEmail(user.googleEmail)]
    return userEmails.includes(configuredOwnerEmail)
  })

  if (!hasConfiguredOwnerAccount) return

  let changed = false
  const timestamp = new Date().toISOString()

  for (const user of Object.values(users)) {
    let userChanged = false
    const userEmails = [normalizeEmail(user.email), normalizeEmail(user.googleEmail)]
    const isConfiguredOwner = userEmails.includes(configuredOwnerEmail)

    const roles = dedupeRoles(user.roles || [])
    const hasOwner = roles.includes('owner')
    const hasAdmin = roles.includes('admin')

    if (isConfiguredOwner) {
      if (!hasOwner) {
        roles.push('owner')
        changed = true
        userChanged = true
      }
      if (!hasAdmin) {
        roles.push('admin')
        changed = true
        userChanged = true
      }
    } else if (hasOwner) {
      const index = roles.indexOf('owner')
      roles.splice(index, 1)
      changed = true
      userChanged = true
    }

    if (userChanged) {
      user.roles = roles
      user.updatedAt = timestamp
    }
  }

  if (changed) {
    await usersStore.put(users)
  }
}
