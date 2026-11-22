import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const installer = fileURLToPath(new URL('../../deploy/install-nginx.sh', import.meta.url))
const template = await readFile(new URL('../../deploy/nginx/keepit.conf', import.meta.url), 'utf8')
const previous = '# Managed by Keepit (deploy/install-nginx.sh)\n# previous\n'

async function fixture(fn: (fixture: {
  target: string
  config: string
  apply: (mode?: string, ...args: string[]) => ReturnType<typeof spawnSync<string>>
  reloads: () => Promise<string[]>
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'keepit-nginx-test-'))
  try {
    const config = join(root, 'conf.d')
    const target = join(config, 'keepit.conf')
    const binaries = join(root, 'bin')
    const reloadLog = join(root, 'reloads')
    await mkdir(config)
    await mkdir(binaries)
    await writeFile(join(binaries, 'flock'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    await writeFile(join(binaries, 'nginx'), `#!/bin/sh
if [ "$1" = "-t" ]; then exit 0; fi
if [ "$1" != "-T" ]; then exit 2; fi
if [ "$TEST_MODE" = syntax ]; then echo 'mock syntax error' >&2; exit 1; fi
if [ "$TEST_MODE" = conflict ]; then echo 'conflicting server name' >&2; fi
if [ "$TEST_MODE" != excluded ]; then echo "# configuration file $KEEPIT_NGINX_CONF_DIR/keepit.conf:"; fi
`, { mode: 0o755 })
    await writeFile(join(binaries, 'systemctl'), `#!/bin/sh
if [ "$1 $2" != "reload nginx" ]; then exit 2; fi
if [ "$TEST_MODE" = reload ] && [ ! -f "$RELOAD_LOG" ]; then
  echo 'failed' >> "$RELOAD_LOG"
  exit 1
fi
echo 'ok' >> "$RELOAD_LOG"
`, { mode: 0o755 })
    const apply = (mode = '', ...args: string[]) => spawnSync('bash', [installer, ...args], {
      encoding: 'utf8', timeout: 5000,
      env: {
        ...process.env, PATH: binaries + delimiter + process.env.PATH,
        KEEPIT_NGINX_CONF_DIR: config, RELOAD_LOG: reloadLog, TEST_MODE: mode
      }
    })
    const reloads = async () => (await readFile(reloadLog, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean)
    await fn({ target, config, apply, reloads })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('installeert één keer; ongewijzigde configuraties herladen alleen met --reload', () => fixture(async ({ target, apply, reloads }) => {
  assert.equal(apply().status, 0)
  assert.equal(await readFile(target, 'utf8'), template)
  assert.equal(apply().status, 0)
  assert.deepEqual(await reloads(), ['ok'])
  assert.equal(apply('', '--reload').status, 0)
  assert.deepEqual(await reloads(), ['ok', 'ok'])
}))

test('laat een aangepaste of gekoppelde site ongemoeid tenzij een gewoon bestand expliciet wordt overgenomen', () => fixture(async ({ target, config, apply, reloads }) => {
  await writeFile(target, '# custom\n')
  assert.equal(apply().status, 1)
  assert.equal(await readFile(target, 'utf8'), '# custom\n')
  assert.equal(apply('', '--adopt').status, 0)
  const [previousFile] = (await readdir(config)).filter((file) => file.startsWith('.keepit-nginx-previous.'))
  assert.equal(await readFile(join(config, previousFile), 'utf8'), '# custom\n')
  await rm(target)
  await symlink(join(config, 'other.conf'), target)
  assert.equal(apply('', '--adopt').status, 1)
  assert.deepEqual(await reloads(), ['ok'])
}))

test('verkeerde syntax, dubbele sites en ontbrekende includes worden teruggedraaid zonder reload', () => fixture(async ({ target, apply, reloads }) => {
  for (const mode of ['syntax', 'conflict', 'excluded']) {
    await writeFile(target, previous)
    assert.equal(apply(mode).status, 1)
    assert.equal(await readFile(target, 'utf8'), previous)
  }
  await rm(target)
  assert.equal(apply('syntax').status, 1)
  await assert.rejects(readFile(target), { code: 'ENOENT' })
  assert.deepEqual(await reloads(), [])
}))

test('een mislukte reload zet de vorige versie terug en probeert die te herladen', () => fixture(async ({ target, apply, reloads }) => {
  await writeFile(target, previous)
  const result = apply('reload')
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.equal(await readFile(target, 'utf8'), previous)
  assert.deepEqual(await reloads(), ['failed', 'ok'])
}))
