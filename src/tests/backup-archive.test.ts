import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import tar from 'tar-stream'
import { stageBackupArchive, installBackupAttachments, writeBackupArchive } from '../server/helpers/backup-archive.js'
import { invoiceAttachmentPath } from '../server/helpers/invoice-attachment.js'

const backup = { format: 'keepit-backup', version: 1, datasets: { jobs: {} } }
const validate = (input: unknown) => {
  assert.deepEqual(input, backup)
  return input
}
const withWorkspace = async (run: (dir: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), 'keepit-archive-test-'))
  try { await run(directory) }
  finally { await rm(directory, { recursive: true, force: true }) }
}
const fixture = async (root: string, path: string, contents: string) => {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, contents)
}

test('factuurbijlagen blijven vindbaar als een oude back-up naar een andere datamap verhuist', () => {
  const attachment = { year: '2026', filename: 'factuur.pdf' }
  assert.deepEqual(invoiceAttachmentPath('2026/images/factuur.pdf'), attachment)
  assert.deepEqual(invoiceAttachmentPath('/oud/keepit/.database/invoices/2026/images/factuur.pdf'), attachment)
  assert.deepEqual(invoiceAttachmentPath('C:\\keepit\\invoices\\2026\\images\\factuur.pdf'), attachment)
  assert.equal(invoiceAttachmentPath('2026/images/../../private.txt'), undefined)
  assert.equal(invoiceAttachmentPath('2026/images/..'), undefined)
})

test('een archief herstelt werffoto’s en factuurbijlagen en kan de bestanden terugrollen', () => withWorkspace(async (dir) => {
  const source = join(dir, 'source')
  const live = join(dir, 'live')
  const staging = join(dir, 'staging')
  const archive = join(dir, 'download.tar')
  await fixture(source, 'media/2026/werf foto.jpg', 'photo bytes')
  const longPhoto = `media/2026/${'é'.repeat(70)}.jpg`
  await fixture(source, longPhoto, 'long filename')
  await fixture(source, 'invoices/2026/images/factuur.pdf', 'invoice bytes')
  await fixture(live, 'media/2026/old.jpg', 'prior photo')
  await mkdir(staging)
  await writeBackupArchive(archive, source, backup)
  assert.deepEqual(await stageBackupArchive(createReadStream(archive), staging, validate), backup)
  const rollback = await installBackupAttachments(staging, live)
  assert.equal(await readFile(join(live, 'media/2026/werf foto.jpg'), 'utf8'), 'photo bytes')
  assert.equal(await readFile(join(live, longPhoto), 'utf8'), 'long filename')
  assert.equal(await readFile(join(live, 'invoices/2026/images/factuur.pdf'), 'utf8'), 'invoice bytes')
  assert.deepEqual(await rollback(), [])
  assert.equal(await readFile(join(live, 'media/2026/old.jpg'), 'utf8'), 'prior photo')
  await assert.rejects(readFile(join(live, 'invoices/2026/images/factuur.pdf')), { code: 'ENOENT' })
}))

test('een archief met beschadigde bestandsinhoud of zonder controlecode wordt geweigerd', () => withWorkspace(async (dir) => {
  const archive = join(dir, 'download.tar')
  const contents = 'test bytes to corrupt'
  await fixture(dir, 'media/2026/photo.jpg', contents)
  await writeBackupArchive(archive, dir, backup)
  const payload = await readFile(archive)
  const broken = Buffer.from(payload)
  const offset = broken.indexOf(contents)
  assert.ok(offset >= 0)
  broken[offset] ^= 1
  for (const [name, input] of [['corrupt', broken], ['truncated', payload.subarray(0, 2048)]] as const) {
    const staging = join(dir, name)
    await mkdir(staging)
    await assert.rejects(stageBackupArchive(Readable.from([input]), staging, validate))
  }
}))

test('een archief kan geen bestanden buiten de twee bijlagemappen plaatsen of links uitpakken', () => withWorkspace(async (dir) => {
  for (const [index, header] of [
    { name: 'media/../outside.txt' },
    { name: 'media/2026/link', type: 'symlink', linkname: '../../outside.txt' },
    { name: 'other/file' }
  ].entries()) {
    const staging = join(dir, String(index))
    await mkdir(staging)
    const pack = tar.pack()
    pack.entry({ name: 'keepit.json' }, JSON.stringify(backup))
    pack.entry(header, Buffer.alloc(0))
    pack.finalize()
    const chunks: Buffer[] = []
    for await (const chunk of pack) chunks.push(chunk)
    await assert.rejects(stageBackupArchive(Readable.from(chunks), staging, validate))
  }
  await assert.rejects(readFile(join(dir, 'outside.txt')), { code: 'ENOENT' })
}))
