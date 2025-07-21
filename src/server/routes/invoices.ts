import Router from '@koa/router'
import { opendir, readFile, mkdir, writeFile } from 'fs/promises'
import { invoices, invoicesStore } from '../database/database.js'
import multer from '@koa/multer'

const upload = multer({
  storage: multer.diskStorage({
    filename: (req, file, cb) => {
      cb(null, file.originalname)
    },
    destination: async (req, file, cb) => {
      const dir = `./.database/invoices/${new Date().getFullYear()}/images`
      try {
        const dirent = await opendir(dir)
        await dirent.close()
      } catch (error) {
        await mkdir(dir, { recursive: true })
      }
      cb(null, dir)
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024 // 10 MB
  }
})

const router = new Router({
  prefix: '/api/invoices'
})

router.get('/', async (ctx) => {
  ctx.body = invoices
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.post('/', async (ctx) => {
  const { name, description, invoiceImages, company, job, user, notes } = ctx.request.body
  const year = new Date().getFullYear()
  if (!name || !description || !invoiceImages || !company || !job || !user) {
    ctx.status = 400
    ctx.body = { error: 'Missing required fields' }
    return
  }
  const invoice = {
    name,
    description,
    invoiceImages,
    company,
    job,
    user,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    year,
    notes
  }

  const uuid = ctx.request.body.uuid || crypto.randomUUID()

  invoices[uuid] = invoice

  await invoicesStore.put(invoices)

  ctx.body = { content: invoice, uuid }
  ctx.body = invoice
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

router.delete('/:uuid', async (ctx) => {
  const uuid = ctx.params.uuid
  if (!uuid) {
    ctx.status = 400
    ctx.body = { error: 'UUID is required' }
    return
  }
  delete invoices[uuid]
  await invoicesStore.put(invoices)
  ctx.status = 204
})

router.post('/upload', upload.array('files'), async (ctx) => {
  const files = ctx.files
  if (!files || files.length === 0) {
    ctx.status = 400
    ctx.body = { error: 'No files uploaded' }
    return
  }
  ctx.body = files.map((file) => file.path)
  ctx.status = 200
  ctx.set('Content-Type', 'application/json')
})

export default router.routes()
