import pubsub from './helpers/pubsub.js'
import Koa from 'koa'
import http from 'http'
import net from 'net'
import { WebSocketServer } from 'ws'
// external middleware
import statickoa from 'koa-static'
import cors from '@koa/cors'
import { bodyParser } from '@koa/bodyparser'
// internal middleware
import { isAuthenticated, isWebSocketAuthenticated } from './middleware/is-authenticated.js'
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
import invoice from './routes/invoice.js'
import media, { publicMedia } from './routes/media.js'
import shop, { publicShopImages } from './routes/shop.js'
import timeline from './routes/timeline.js'
import planning from './routes/planning.js'
import notifications from './routes/notifications.js'
import quotes from './routes/quotes.js'
import { handleWebSocketConnection } from './helpers/websocket.js'
import { readDescoCatalog } from './helpers/desco.js'
import { readAlelekCatalog } from './helpers/alelek.js'
import { warmShopSearchIndex } from './helpers/shop-search-index.js'

const api = new Koa()

api.use(
  cors({
    origin: '*' // Allow all origins
  })
)
// static files server
api.use(statickoa('www'))

// middleware
api.use(bodyParser())

// contact form
api.use(contact)
api.use(publicMedia)
api.use(publicShopImages)

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
api.use(timeline)
api.use(planning)
api.use(notifications)
api.use(quotes)
api.use(users)
api.use(roles)
api.use(companies)
api.use(invoices)
api.use(media)
api.use(invoice)
api.use(jobs)
api.use(job)
api.use(shop)

// create a native HTTP server so we can attach a WebSocket server to it
const server = http.createServer(api.callback())

// WebSocket server on the same HTTP server, mounted at /ws
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', async (socket, req) => {
  handleWebSocketConnection(socket, req)
})

wss.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') return
  console.error('WebSocket server error:', error.message)
})

const DEFAULT_PORT = 5678
const MAX_PORT_ATTEMPTS = 10

const resolveStartPort = (): number => {
  const envPort = Number(process.env.PORT)
  if (Number.isInteger(envPort) && envPort > 0) return envPort
  return DEFAULT_PORT
}

const isPortAvailable = async (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const tester = net.createServer()

    tester.once('error', () => {
      resolve(false)
    })

    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })

    tester.listen(port)
  })
}

const findAvailablePort = async (startPort: number, maxAttempts: number): Promise<number> => {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset
    if (await isPortAvailable(candidate)) return candidate
  }

  throw new Error(`No free port found between ${startPort} and ${startPort + maxAttempts - 1}`)
}

const startServer = async (): Promise<void> => {
  const preferredPort = resolveStartPort()
  const port = await findAvailablePort(preferredPort, MAX_PORT_ATTEMPTS)

  const [descoCatalog, alelekCatalog] = await Promise.all([readDescoCatalog(), readAlelekCatalog()])
  try {
    await warmShopSearchIndex([
      { source: 'desco', updatedAt: descoCatalog.updatedAt, items: descoCatalog.items },
      { source: 'alelek', updatedAt: alelekCatalog.updatedAt, items: alelekCatalog.items }
    ])
  } catch (error) {
    console.error('Shop search index warmup failed:', error instanceof Error ? error.message : String(error))
  }

  if (port !== preferredPort) {
    console.warn(`Port ${preferredPort} is in use, starting on ${port} instead.`)
  }

  server.listen(port, () => {
    console.log(`Server (HTTP + WS) is running on http://localhost:${port}`)
  })
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Failed to start server:', message)
  process.exit(1)
})
