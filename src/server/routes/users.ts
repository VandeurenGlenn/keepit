import Router from '@koa/router'

import { invites, invitesStore, users, usersStore } from './../database/database.js'
import { sendInviteMail } from '../helpers/mailer.js'

const router = new Router({
  prefix: '/api/users'
})

router.post('/', async (ctx) => {
  const { email } = ctx.request.body
  if (!email) {
    ctx.status = 400
    ctx.body = { error: 'Email is required', message: 'Please provide an email address' }
    return
  }

  // Check if user already exists
  const existingUser = Object.values(users).find((user) => user.email === email)
  if (existingUser) {
    ctx.status = 400
    ctx.body = { error: 'User already exists', message: 'A user with this email already exists' }
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
  ctx.body = users
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
