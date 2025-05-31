import Router from '@koa/router'
import { companies, companiesStore } from '../database/database.js'
import { sendContactMail } from '../helpers/mailer.js'

const router = new Router({
  prefix: '/api/contact'
})

router.post('/', async (ctx) => {
  const { name, email, address, message, subject, projectType, phoneNumber } = ctx.request.body
  await sendContactMail(name, email, phoneNumber, address, message, projectType, subject)
  ctx.status = 201
})

export default router.routes()
