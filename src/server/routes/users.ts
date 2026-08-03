import { Router } from '@koa/router'

import {
  invites,
  invitesStore,
  timelineTrackingStates,
  timelineTrackingStatesStore,
  users,
  usersStore
} from './../database/database.js'
import { sendInviteMail } from '../helpers/mailer.js'

const router = new Router({
  prefix: '/api/users'
})

router.post('/', async (ctx) => {
  const body = (ctx.request.body || {}) as Record<string, unknown>
  const actor = users[ctx.state.userid]
  if (!actor?.roles?.some((role) => role === 'admin' || role === 'roles')) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden', message: 'Je hebt geen rechten om gebruikers uit te nodigen' }
    return
  }

  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ctx.status = 400
    ctx.body = { error: 'Valid email is required', message: 'Geef een geldig e-mailadres op' }
    return
  }

  const existingUser = Object.values(users).find((user) => user.email?.trim().toLowerCase() === email)
  const existingInvite = Object.values(invites).find((invite) => invite.email?.trim().toLowerCase() === email)
  if (existingUser || existingInvite) {
    ctx.status = 400
    ctx.body = { error: 'User already exists', message: 'Dit e-mailadres is al geregistreerd of uitgenodigd' }
    return
  }

  const uuid = crypto.randomUUID()

  const newUser = {
    email,
    roles: ['user'],
    createdAt: Date.now(),
    invited: true
  }

  invites[uuid] = newUser

  try {
    await sendInviteMail(email, uuid)
    console.log(`Sent invite email to ${email} with UUID: ${uuid}`)

    await invitesStore.put(invites)
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: 'Failed to invite new user' }
    return
  }

  ctx.status = 201
  ctx.body = newUser
  ctx.set('Content-Type', 'application/json')
})

router.patch('/me/preferences', async (ctx) => {
  const userId = ctx.state.userid
  const user = users[userId]
  if (!user) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  const body = (ctx.request.body || {}) as Record<string, unknown>
  const value = body.continuousTimelineLocation
  if (typeof value !== 'boolean') {
    ctx.status = 400
    ctx.body = { error: 'continuousTimelineLocation must be a boolean' }
    return
  }

  user.preferences = {
    ...user.preferences,
    continuousTimelineLocation: value
  }
  user.updatedAt = new Date().toISOString()
  if (!value) delete timelineTrackingStates[userId]

  try {
    await Promise.all([
      usersStore.put(users),
      !value ? timelineTrackingStatesStore.put(timelineTrackingStates) : Promise.resolve()
    ])
    ctx.status = 200
    ctx.body = user.preferences
  } catch {
    ctx.status = 500
    ctx.body = { error: 'Failed to persist preferences' }
  }
})

router.get('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  ctx.body = users[uuid] || {}
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.get('/', async (ctx) => {
  const includeInvited = ['1', 'true', 'yes'].includes(String(ctx.query.includeInvited || '').toLowerCase())

  if (!includeInvited) {
    ctx.body = users
    ctx.status = 200
    ctx.set('Content-Type', 'application/json')
    return
  }

  const actor = users[ctx.state.userid]
  if (!actor?.roles?.some((role) => role === 'admin' || role === 'roles')) {
    ctx.status = 403
    ctx.body = { error: 'Forbidden', message: 'Je hebt geen rechten om uitnodigingen te bekijken' }
    return
  }

  const invitedUsers = Object.fromEntries(
    Object.entries(invites).map(([uuid, invite]) => {
      const createdAt = new Date(invite.createdAt || Date.now()).toISOString()
      return [
        uuid,
        {
          ...invite,
          name: 'Uitgenodigde gebruiker',
          picture: '',
          phone: '',
          createdAt,
          updatedAt: createdAt,
          invited: true
        }
      ]
    })
  )

  ctx.body = {
    ...users,
    ...invitedUsers
  }
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.delete('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required', message: 'Please provide a user UUID to delete' }
    return
  }
  if (!users[uuid]) {
    ctx.status = 404
    ctx.body = { error: 'User not found', message: 'User may have already been deleted' }
    return
  }

  if (users[uuid].roles?.includes('owner')) {
    ctx.status = 400
    ctx.body = { error: 'Cannot delete owner user', message: 'Please assign a new owner before deleting this user' }
    return
  }

  if (users[uuid].roles?.includes('admin')) {
    ctx.body = {
      error: 'Cannot delete admin user',
      message: 'Please assign at least one admin before deleting this user'
    }
    return
  }

  delete users[uuid]
  try {
    await usersStore.put(users)
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: 'Failed to persist user deletion' }
    return
  }

  ctx.status = 204
})

export default router.routes()
