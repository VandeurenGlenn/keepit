import assert from 'node:assert/strict'
import test from 'node:test'
import { findOpenPrestationId } from '../server/helpers/work-sessions.ts'

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
