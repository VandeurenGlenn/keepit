import assert from 'node:assert/strict'
import test from 'node:test'
import { createRestoreGuard, persistRestore } from '../server/helpers/restore-guard.js'

test('herstel wacht op actieve aanvragen en weigert nieuwe aanvragen en een tweede herstel', async () => {
  const guard = createRestoreGuard()
  const leave = guard.enterRequest()!
  const restore = guard.beginRestore()!
  assert.equal(guard.enterRequest(), undefined)
  assert.equal(guard.beginRestore(), undefined)
  let ready = false
  const wait = restore.ready.then(() => { ready = true })
  await Promise.resolve()
  assert.equal(ready, false)
  leave()
  await wait
  assert.equal(ready, true)
  restore.release()
  assert.equal(typeof guard.enterRequest(), 'function')
})

test('rollback begint pas als ook de trage herstelwrites klaar zijn', async () => {
  const log: string[] = []
  let finish!: () => void
  const slow = new Promise<void>((resolve) => { finish = resolve })
  const result = persistRestore(['jobs', 'hours'], { jobs:'new', hours:'new' }, { jobs:'old', hours:'old' }, async (name, value) => {
    if (name === 'jobs' && value === 'new') throw new Error('Schrijffout')
    if (name === 'hours' && value === 'new') await slow
    log.push(`${name}:${value}`)
  })
  await Promise.resolve()
  assert.deepEqual(log, [])
  finish()
  assert.deepEqual(await result, { restored:false, failedRollback:[] })
  assert.deepEqual(log, ['hours:new', 'jobs:old', 'hours:old'])
})

test('onvolledige rollback meldt precies welke datasets niet konden worden teruggezet', async () => {
  const result = await persistRestore(['orders'], { orders:'new' }, { orders:'old' }, async () => {
    throw new Error('Opslag niet bereikbaar')
  })
  assert.deepEqual(result, { restored:false, failedRollback:['orders'] })
})
