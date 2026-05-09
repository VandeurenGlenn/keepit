import { mkdir, readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'

const sessionSecretDirectory = resolve('.database')
const sessionSecretPath = resolve(sessionSecretDirectory, 'session-secret')

const readConfigSecret = async () => {
  try {
    const raw = await readFile('./server.config.json', 'utf8')
    const parsed = JSON.parse(raw)
    const configuredSecret = parsed?.session?.secret

    if (typeof configuredSecret !== 'string') return ''

    const trimmed = configuredSecret.trim()
    return trimmed
  } catch {
    return ''
  }
}

const createPersistentSecret = async () => {
  await mkdir(sessionSecretDirectory, { recursive: true })

  try {
    const existingSecret = (await readFile(sessionSecretPath, 'utf8')).trim()
    if (existingSecret) return existingSecret
  } catch {
    // ignore and create the secret below
  }

  const generatedSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  await writeFile(sessionSecretPath, generatedSecret, 'utf8')
  return generatedSecret
}

const configuredSecret = (await readConfigSecret()) || process.env.KEEPIT_SESSION_SECRET?.trim() || ''

export const sessionSecret = configuredSecret || (await createPersistentSecret())
