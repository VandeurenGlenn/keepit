import Router from '@koa/router'
import { companies, companiesStore } from '../database/database.js'
import { sendContactMail } from '../helpers/mailer.js'

const router = new Router({
  prefix: '/api/contact'
})

router.post('/', async (ctx) => {
  const { name, email, address, message, subject, projectType, telephoneNumber } = ctx.request.body
  await sendContactMail(name, email, telephoneNumber, address, message, projectType, subject)
  ctx.status = 201
})

export default router.routes()
