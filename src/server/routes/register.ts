import { Router } from '@koa/router'
import { invites, invitesStore, users, usersStore } from '../database/database.js'
import type { User } from '../../types/index.js'
import { getConfiguredOwnerEmail } from '../helpers/owner.js'
import { createKeyedQueue } from '../helpers/keyed-queue.js'
import { hasRegisteredEmail, normalizeRegistrationEmail } from '../helpers/registration.js'

const router = new Router({ prefix: '/api/register' })
const register = createKeyedQueue()

router.get('/', (ctx) => {
  ctx.body = { invitationRequired: Object.keys(users).length > 0 }
})

router.post('/', async (_, next) => register('register', next), async (ctx) => {
  const body = (ctx.request.body || {}) as Partial<User> & { inviteId?: string }
  if (ctx.state.googleProfile?.email_verified !== true) {
    ctx.status = 403
    ctx.body = { error: 'Verified Google email required', message: 'Google kon dit e-mailadres niet verifiëren.' }
    return
  }
  const id = ctx.state.userid as string
  if (Object.hasOwn(users, id)) {
    ctx.body = { content: users[id] }
    return
  }

  const hasExistingUsers = Object.keys(users).length > 0

  const inviteId = String(body.inviteId || '').trim()
  const invite = inviteId && Object.hasOwn(invites, inviteId) ? invites[inviteId] : undefined

  if (hasExistingUsers && !invite) {
    ctx.status = 403
    ctx.body = { error: 'Valid invitation required', message: 'Open de persoonlijke uitnodigingslink opnieuw.' }
    return
  }

  const phone = String(body.phone || '').trim()
  if (!phone) {
    ctx.status = 400
    ctx.body = { error: 'Phone required', message: 'Vul eerst je telefoonnummer in.' }
    return
  }

  const place = body.place
  if (!place || typeof place !== 'object' || !place.id || !place.formattedAddress) {
    ctx.status = 400
    ctx.body = { error: 'Valid place required', message: 'Kies je werkadres uit de voorgestelde locaties.' }
    return
  }

  const invitedEmail = normalizeRegistrationEmail(invite?.email)
  if (hasRegisteredEmail(users, invitedEmail)) {
    ctx.status = 409
    ctx.body = { error: 'Invitation already used', message: 'Dit werkadres is al aan een Google-account gekoppeld.' }
    return
  }

  const googleEmail = normalizeRegistrationEmail(ctx.state.googleProfile.email)
  const now = new Date().toISOString()

  const account: User = {
    name: body.name || ctx.state.googleProfile.name,
    email: invitedEmail || googleEmail,
    googleEmail,
    picture: body.picture || ctx.state.googleProfile.picture,
    place,
    phone,
    createdAt: now,
    updatedAt: now,
    roles: invite?.roles?.length ? [...invite.roles] : undefined,
    invited: false
  }

  const configuredOwnerEmail = getConfiguredOwnerEmail()
  const isConfiguredOwner = Boolean(
    configuredOwnerEmail && [googleEmail, invitedEmail].some((value) => value === configuredOwnerEmail)
  )

  if (isConfiguredOwner) {
    account.roles = Array.from(new Set([...(account.roles || []), 'owner', 'admin']))
  } else if (!hasExistingUsers && !configuredOwnerEmail) {
    account.roles = ['owner', 'admin']
  } else if (!account.roles?.length) {
    account.roles = ['user']
  }

  users[id] = account
  try {
    await usersStore.put(users)
  } catch (error) {
    delete users[id]
    console.error('Registration could not be saved:', error)
    ctx.status = 500
    ctx.body = { error: 'De registratie kon niet worden opgeslagen. Je uitnodiging blijft geldig; probeer opnieuw.' }
    return
  }
  if (invite) {
    delete invites[inviteId]
    await invitesStore.put(invites).catch((error) => {
      // The user is already durable; any stale invitation is hidden and cannot be used again.
      console.warn('Could not remove consumed invitation:', error)
    })
  }
  ctx.body = { content: account }
  ctx.status = 201
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
