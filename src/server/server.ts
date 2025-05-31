import Koa from 'koa'
// external middleware
import statickoa from 'koa-static'
import { bodyParser } from '@koa/bodyparser'
// internal middleware
import { isAuthenticated } from './middleware/is-authenticated.js'
// routes
import companies from './routes/companies.js'
import invoices from './routes/invoices.js'
import job from './routes/job.js'
import jobs from './routes/jobs.js'
import users from './routes/users.js'
import roles from './routes/roles.js'
import register from './routes/register.js'
import isUser from './middleware/is-user.js'
import handshake from './routes/handshake.js'
import hours from './routes/hours.js'
import contact from './routes/contact.js'

const api = new Koa()

// static files server
api.use(statickoa('www'))

// contact form
api.use(contact)

// middleware
api.use(bodyParser())

// internal middleware
// set/check the user id & see if the user is authenticated
api.use(isAuthenticated)

// this middleware is used to check if the user is registered
api.use(handshake)
// this middleware is used to register the user after authentication
api.use(register)

// everything after this point requires a user account
api.use(isUser)

// main routes
api.use(hours)
api.use(users)
api.use(roles)
api.use(companies)
api.use(invoices)
api.use(jobs)
api.use(job)

api.listen(5678, () => {
  console.log('Server is running on http://localhost:5678')
})
