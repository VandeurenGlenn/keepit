import assert from 'node:assert/strict'
import test from 'node:test'
import { findActiveWorkSession, findOpenPrestationId } from '../server/helpers/work-sessions.ts'

const base = { description:'',duration:0,serverCheckin:1000,checkin:900,jobId:'job-1' }

test('stop closes the explicitly active manual session instead of the last list entry',()=>{
  const hours = {
    manual:{...base,source:'manual' as const},
    automatic:{...base,source:'legacy' as const,checkin:950}
  }
  assert.equal(findOpenPrestationId('manual','job-1',['manual','automatic'],hours),'manual')
})

test('falls back to the newest open session when migrating old data',()=>{
  const hours = {closed:{...base,checkout:1200},open:{...base,checkin:1300}}
  assert.equal(findOpenPrestationId(undefined,'job-1',['closed','open'],hours),'open')
})

test('ignores a preferred session after an admin adds its checkout',()=>{
  const hours = {closed:{...base,checkout:1400},older:{...base,checkin:800,checkout:1100}}
  assert.equal(findActiveWorkSession('closed',hours),undefined)
})

test('selects another open session when the preferred session was closed',()=>{
  const hours = {
    closed:{...base,checkout:1400},
    open:{...base,jobId:'job-2',checkin:1500}
  }
  assert.equal(findActiveWorkSession('closed',hours)?.id,'open')
})
