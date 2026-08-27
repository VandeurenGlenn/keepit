import test from 'node:test'
import assert from 'node:assert/strict'
import { findPlanningConflicts } from '../frontend/helpers/planning-conflicts.ts'
import type { PlanningEntry } from '../types/index.js'

const entry: PlanningEntry = {
  id: 'one', jobId: 'job-a', userIds: ['glenn'],
  start: '2026-08-27T08:00:00.000Z', end: '2026-08-27T12:00:00.000Z',
  createdAt: '', updatedAt: '', createdBy: 'admin'
}

test('detects overlapping planning for the same employee', () => {
  const result = findPlanningConflicts([entry], { jobId: 'job-b', userIds: ['glenn'], start: '2026-08-27T11:00:00.000Z', end: '2026-08-27T13:00:00.000Z' })
  assert.equal(result[0]?.kind, 'overlap')
})

test('warns when travel time between different jobs is too short', () => {
  const result = findPlanningConflicts([entry], { jobId: 'job-b', userIds: ['glenn'], start: '2026-08-27T12:15:00.000Z', end: '2026-08-27T14:00:00.000Z' })
  assert.equal(result[0]?.kind, 'travel-time')
})

test('ignores the entry currently being edited', () => {
  const result = findPlanningConflicts([entry], { jobId: 'job-a', userIds: ['glenn'], start: entry.start, end: entry.end }, 'one')
  assert.deepEqual(result, [])
})
