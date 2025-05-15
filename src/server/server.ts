import Koa from 'koa'
// external middleware
import statickoa from 'koa-static'
import { bodyParser } from '@koa/bodyparser'
// routes
import companies from './routes/companies.js'
import invoices from './routes/invoices.js'
import job from './routes/job.js'
import jobs from './routes/jobs.js'
import users from './routes/users.js'
import roles from './routes/roles.js'
import register from './routes/register.js'

const api = new Koa()

// static files server
api.use(statickoa('www'))

// middleware
api.use(bodyParser())

// this middleware is used to register the user after authentication
api.use(register)

// everything after this point requires a user account
api.use(users)
api.use(roles)
api.use(companies)
api.use(invoices)
api.use(jobs)
api.use(job)

api.listen(5678, () => {
  console.log('Server is running on http://localhost:5678')
})
