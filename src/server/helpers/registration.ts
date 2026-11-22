import type { User } from '../../types/index.js'

export const normalizeRegistrationEmail = (email: unknown) => typeof email === 'string' ? email.trim().toLowerCase() : ''

export function hasRegisteredEmail(users: Record<string, User>, email: string): boolean {
  const normalized = normalizeRegistrationEmail(email)
  return Boolean(normalized && Object.values(users).some((user) =>
    normalizeRegistrationEmail(user.email) === normalized || normalizeRegistrationEmail(user.googleEmail) === normalized
  ))
}
