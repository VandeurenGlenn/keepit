import { Router } from '@koa/router'
import { invites, invitesStore, users, usersStore } from '../database/database.js'
import type { User } from '../../types/index.js'
import { getConfiguredOwnerEmail } from '../helpers/owner.js'

const router = new Router({ prefix: '/api/register' })

router.post('/', async (ctx) => {
  const body = (ctx.request.body || {}) as Partial<User> & { inviteId?: string }
  if (users[ctx.state.userid]) {
    ctx.status = 400
    ctx.body = { error: 'User already registered' }
    return
  }

  const hasExistingUsers = Object.keys(users).length > 0

  if (ctx.state.googleProfile.email_verified !== true) {
    ctx.status = 403
    ctx.body = { error: 'Verified Google email required', message: 'Google kon dit e-mailadres niet verifiëren.' }
    return
  }

  const inviteId = String(body.inviteId || '').trim()
  const invite = inviteId ? invites[inviteId] : undefined

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

  const invitedEmail = invite?.email?.trim().toLowerCase()
  if (invitedEmail && Object.values(users).some((user) => user.email?.trim().toLowerCase() === invitedEmail)) {
    ctx.status = 409
    ctx.body = { error: 'Invitation already used', message: 'Dit werkadres is al aan een Google-account gekoppeld.' }
    return
  }

  const googleEmail = String(ctx.state.googleProfile.email || '')
    .trim()
    .toLowerCase()
  const now = new Date().toISOString()

  users[ctx.state.userid] = {
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
    users[ctx.state.userid].roles = Array.from(new Set([...(users[ctx.state.userid].roles || []), 'owner', 'admin']))
  } else if (!hasExistingUsers && !configuredOwnerEmail) {
    users[ctx.state.userid].roles = ['owner', 'admin']
  } else if (!users[ctx.state.userid].roles?.length) {
    users[ctx.state.userid].roles = ['user']
  }

  if (invite) delete invites[inviteId]

  await Promise.all([usersStore.put(users), invite ? invitesStore.put(invites) : Promise.resolve()])
  ctx.body = { content: users[ctx.state.userid] }
  ctx.status = 201
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
