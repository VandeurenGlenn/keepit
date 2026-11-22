import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWorkspaceSearch, workspaceSearchRank } from '../server/helpers/workspace-search.ts'

test('zoeken negeert accenten en leestekens en vindt woorden over meerdere velden', () => {
  const query = normalizeWorkspaceSearch('  Héverlee, 147: Peeters ')
  assert.equal(query, 'heverlee 147 peeters')
  assert.ok(workspaceSearchRank(query, 'Werf Peeters', 'Mechelsesteenweg 147, Héverlee') > 0)
  assert.equal(workspaceSearchRank(query, 'Werf Peeters', 'Mechelsesteenweg 148, Heverlee'), 0)
})

test('een exacte titel staat voor een vermelding in adres of omschrijving', () => {
  assert.ok(workspaceSearchRank('peeters', 'Peeters') > workspaceSearchRank('peeters', 'Werf Leuven', 'Peeters'))
  assert.ok(workspaceSearchRank('peeters', 'Peeters renovatie') > workspaceSearchRank('peeters', 'Werf Peeters'))
  assert.equal(workspaceSearchRank('', 'Peeters'), 0)
})
