import assert from 'node:assert/strict'
import test from 'node:test'
import type { Invoices, Jobs, PlanningEntries } from '../types/index.js'
import { companyLinks, jobArchiveBlockers } from '../server/helpers/business-links.ts'

test('relaties tellen zowel gekoppelde jobs als historische facturen', () => {
  const jobs = { first: { customerId: 'klant' }, other: { customerId: 'andere' } } as Jobs
  const invoices = { old: { company: 'klant' }, other: { company: 'andere' } } as Invoices
  assert.deepEqual(companyLinks('klant', jobs, invoices), { jobs: 1, invoices: 1 })
  assert.deepEqual(companyLinks('vrij', jobs, invoices), { jobs: 0, invoices: 0 })
})

test('open uren en lopende of toekomstige planning blokkeren alleen de betrokken job', () => {
  const now = Date.parse('2026-11-22T10:00Z')
  const hours = { werknemer: {
    open: { jobId: 'werf', checkin: now - 1, serverCheckin: now },
    closed: { jobId: 'werf', checkin: now - 2, checkout: now - 1, serverCheckin: now },
    other: { jobId: 'andere', checkin: now - 1, serverCheckin: now }
  } }
  const planning = {
    past: { jobId: 'werf', end: '2026-11-22T10:00Z' },
    future: { jobId: 'werf', end: '2026-11-22T12:00Z' }
  } as PlanningEntries
  assert.deepEqual(jobArchiveBlockers('werf', hours, planning, now).map(({ kind }) => kind), ['open-hours', 'planning'])
  assert.deepEqual(jobArchiveBlockers('klaar', hours, planning, now), [])
})
