import assert from 'node:assert/strict'
import test from 'node:test'
import type { MaterialLine } from '../types/index.js'
import { mergeMaterialRows } from '../frontend/helpers/material-merge.ts'

const row: MaterialLine = { name: 'Automaat', articleNumber: 'A-20', productNumber: 'F-20', unit: 'stuk', quantity: 2, unitPrice: 3 }

test('varianten met dezelfde naam of hetzelfde fabrikantnummer blijven afzonderlijk', () => {
  const variant = { ...row, articleNumber: 'A-25' }
  const otherProduct = { ...row, productNumber: 'F-25' }
  assert.deepEqual(mergeMaterialRows([row], [variant, otherProduct]), [row, variant, otherProduct])
})

test('hetzelfde artikel telt op zonder de bestaande omschrijving of aangepaste prijs te overschrijven', () => {
  assert.deepEqual(mergeMaterialRows([row], [{ ...row, articleNumber: ' a-20 ', name: 'Nieuwe catalogusnaam', quantity: 1 }]), [
    { ...row, quantity: 3 }
  ])
  const otherPrice = { ...row, unitPrice: 4 }
  const otherUnit = { ...row, unit: 'doos' }
  assert.deepEqual(mergeMaterialRows([row], [otherPrice, otherUnit]), [row, otherPrice, otherUnit])
})

test('een vrije regel wordt niet met een catalogusartikel of toeslag samengevoegd', () => {
  const free = { name: row.name, quantity: 1, unit: row.unit, unitPrice: row.unitPrice }
  const surcharge: MaterialLine = { ...free, kind: 'small-materials' }
  assert.deepEqual(mergeMaterialRows([row, surcharge], [free]), [row, surcharge, free])
})
