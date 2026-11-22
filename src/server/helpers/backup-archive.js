import { createHash } from 'node:crypto'
import { constants, createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, opendir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import tar from 'tar-stream'

const roots = ['media', 'invoices']
const metadataName = 'keepit.json'
const digestName = 'keepit.sha256'
const metadataLimit = 25 * 1024 * 1024
export const backupArchiveLimit = 2 * 1024 ** 3
const maxFiles = 100_000

function isAttachment(name) {
  const [root, ...parts] = name.split('/')
  return roots.includes(root) && parts.length > 0 && parts.length <= 16 &&
    parts.every((part) => part !== '' && part !== '.' && part !== '..' &&
      Buffer.byteLength(part) <= 255 && !/[\\:\x00-\x1f\x7f]/u.test(part))
}

async function* attachmentFiles(root, path) {
  const dir = await opendir(join(root, path)).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!dir) return
  for await (const entry of dir) {
    const name = `${path}/${entry.name}`
    if (!isAttachment(name)) throw new Error('De datamap bevat een ongeldige bestandsnaam.')
    if (entry.isDirectory()) yield* attachmentFiles(root, name)
    else if (entry.isFile()) yield name
    else throw new Error('Back-ups ondersteunen alleen gewone bestanden en mappen.')
  }
}

const hashHeader = (hash, name, size) => hash.update(JSON.stringify([name, size])).update('\n')
const hashBytes = (hash) => new Transform({
  transform(chunk, _, done) { hash.update(chunk); done(null, chunk) }
})

const limitBytes = () => {
  let count = 0
  return new Transform({
    transform(chunk, _, done) {
      count += chunk.length
      if (count > backupArchiveLimit) done(new Error('Het back-uparchief is groter dan 2 GB.'))
      else done(null, chunk)
    }
  })
}

// tar-stream collects extended path headers in memory before emitting entries.
// Keep that metadata bounded while passing ordinary file bodies through.
const checkTarHeaders = () => {
  const header = Buffer.alloc(512)
  let headerBytes = 0
  let bodyBytes = 0
  return new Transform({
    transform(chunk, _, done) {
      let offset = 0
      while (offset < chunk.length) {
        if (bodyBytes) {
          const skip = Math.min(bodyBytes, chunk.length - offset)
          offset += skip
          bodyBytes -= skip
          continue
        }
        const take = Math.min(header.length - headerBytes, chunk.length - offset)
        chunk.copy(header, headerBytes, offset, offset + take)
        offset += take
        headerBytes += take
        if (headerBytes < header.length) continue
        headerBytes = 0
        const rawSize = header.toString('ascii', 124, 136).replace(/\0+$/, '').trim()
        const entryType = header[156]
        const size = rawSize ? (/^[0-7]+$/.test(rawSize) ? Number.parseInt(rawSize, 8) : Infinity) : 0
        if (![0, 48, 120].includes(entryType) || size > backupArchiveLimit || (entryType === 120 && size > 8192)) {
          return done(new Error('Ongeldige of te grote archiefkop.'))
        }
        bodyBytes = Math.ceil(size / 512) * 512
      }
      done(null, chunk)
    }
  })
}

export async function writeBackupArchive(file, root, backup) {
  const pack = tar.pack()
  const output = pipeline(pack, limitBytes(), createWriteStream(file, { flags: 'wx', mode: 0o600 }))
  const add = async () => {
    let count = 0
    const hash = createHash('sha256')
    const metadata = Buffer.from(JSON.stringify(backup))
    if (metadata.length > metadataLimit) throw new Error('De gegevens in de back-up zijn groter dan 25 MB.')
    hashHeader(hash, metadataName, metadata.length).update(metadata)
    await new Promise((resolve, reject) => pack.entry({ name: metadataName }, metadata, (error) => error ? reject(error) : resolve(undefined)))
    for (const scope of roots) {
      const info = await lstat(join(root, scope)).catch((error) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (!info) continue
      if (!info.isDirectory()) throw new Error('De map met bijlagen is ongeldig.')
      for await (const name of attachmentFiles(root, scope)) {
        if (++count > maxFiles) throw new Error('Te veel bestanden in de back-up.')
        const path = join(root, name)
        const info = await lstat(path)
        if (!info.isFile()) throw new Error('Een bijlage is gewijzigd tijdens het maken van de back-up.')
        hashHeader(hash, name, info.size)
        await pipeline(
          createReadStream(path, { flags: constants.O_RDONLY | constants.O_NOFOLLOW }),
          hashBytes(hash), pack.entry({ name, size: info.size, mode: 0o600 })
        )
      }
    }
    const digest = hash.digest('hex')
    pack.entry({ name: digestName }, digest)
    pack.finalize()
  }
  try {
    await Promise.all([add().catch((error) => { pack.destroy(error); throw error }), output])
  } catch (error) {
    await output.catch(() => undefined)
    throw error
  }
}

const readSmall = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Extract only verified attachment files into a caller-owned empty staging directory. */
export async function stageBackupArchive(source, staging, validate) {
  await Promise.all(roots.map((root) => mkdir(join(staging, root), { mode: 0o700 })))
  const extract = tar.extract()
  const hash = createHash('sha256')
  let backup
  let verified = false
  let count = 0
  let processing = Promise.resolve()
  extract.on('entry', (header, stream, next) => {
    // Rejecting a header destroys its unread entry as well as the extractor.
    stream.on('error', () => {})
    const process = async () => {
      const { name, size, type } = header
      if (verified || type !== 'file' || !Number.isSafeInteger(size) || size < 0) throw new Error('Ongeldige archiefinhoud.')
      if (!backup) {
        if (name !== metadataName || size > metadataLimit) throw new Error('Dit is geen geldig Keepit-archief.')
        const metadata = await readSmall(stream)
        hashHeader(hash, name, size).update(metadata)
        backup = validate(JSON.parse(metadata.toString('utf8')))
      } else if (name === digestName) {
        if (size !== 64 || (await readSmall(stream)).toString('ascii') !== hash.digest('hex')) {
          throw new Error('Het archief is beschadigd: de inhoud komt niet overeen met de controlecode.')
        }
        verified = true
      } else {
        if (!isAttachment(name) || ++count > maxFiles) throw new Error('Het archief bevat een niet-toegelaten bestand.')
        const path = join(staging, name)
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        hashHeader(hash, name, size)
        await pipeline(stream, hashBytes(hash), createWriteStream(path, { flags: 'wx', mode: 0o600 }))
      }
    }
    processing = process().then(() => next(), (error) => next(error))
  })
  try {
    await pipeline(source, limitBytes(), checkTarHeaders(), extract)
  } finally {
    await processing
  }
  if (!verified) throw new Error('Het Keepit-archief is onvolledig.')
  return backup
}

/** Swap only the two managed file trees; keep originals available for rollback. */
export async function installBackupAttachments(staging, live) {
  const changes = []
  const rollback = async () => {
    const errors = []
    for (const change of [...changes].reverse()) {
      try {
        if (change.installed) await rename(change.target, change.incoming)
        if (change.saved) await rename(change.previous, change.target)
      } catch (error) { errors.push(error) }
    }
    return errors
  }
  try {
    for (const root of roots) {
      const change = {
        incoming: join(staging, root), target: join(live, root), previous: join(staging, `previous-${root}`),
        installed: false, saved: false
      }
      changes.push(change)
      try {
        await rename(change.target, change.previous)
        change.saved = true
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await rename(change.incoming, change.target)
      change.installed = true
    }
  } catch (error) {
    const failures = await rollback()
    if (failures.length) throw new AggregateError([error, ...failures], 'Bijlagen konden niet volledig worden teruggezet.')
    throw error
  }
  return rollback
}
