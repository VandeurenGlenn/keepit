import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkReport, resolveReportPeriod } from '../server/helpers/hours-report.ts'
import { reportCsv, reportSessionTimes, reportWarnings } from '../frontend/helpers/hours-report-format.ts'

const hour = 3_600_000
const at = Date.parse

test('de Belgische kalenderdagen lopen correct door zomer- en wintertijd', () => {
  const spring = resolveReportPeriod('2026-03-29', '2026-03-29')
  assert.deepEqual(spring, { from: at('2026-03-28T23:00Z'), to: at('2026-03-29T22:00Z') })
  const autumn = resolveReportPeriod('2026-10-25', '2026-10-25')
  assert.deepEqual(autumn, { from: at('2026-10-24T22:00Z'), to: at('2026-10-25T23:00Z') })
})

test('ongeldige datums worden geweigerd en oudere ISO-aanvragen blijven bruikbaar', () => {
  assert.equal(resolveReportPeriod('2026-02-30', '2026-03-01'), undefined)
  assert.equal(resolveReportPeriod('2026-08-01', '2026-07-31'), undefined)
  assert.equal(resolveReportPeriod('2025-01-01', '2026-01-02'), undefined)
  assert.deepEqual(resolveReportPeriod('2026-09-01T00:00Z', '2026-09-02T00:00Z'), {
    from: at('2026-09-01T00:00Z'), to: at('2026-09-02T00:00Z')
  })
})

test('alleen het overlappende deel telt mee, maar waarschuwingen gebruiken de hele registratie', () => {
  const { from, to } = resolveReportPeriod('2026-03-29', '2026-03-29')!
  const entry = (checkin: number, checkout?: number, future = false) => ({
    checkin, checkout, serverCheckin: future ? checkin - 1 : checkin,
    serverCheckout: checkout, jobId: 'werf'
  })
  const { rows } = buildWorkReport({ medewerker: {
    night: entry(from - 12 * hour, from + 2 * hour, true),
    endsAtStart: entry(from - hour, from),
    startsAtEnd: entry(to, to + hour),
    endsOutside: entry(to - hour, to + hour),
    oldOpen: entry(from - hour),
    open: entry(from + hour),
    invalid: entry(from + hour, from)
  } }, from, to)
  assert.deepEqual(rows.map(({ prestationId, duration }) => [prestationId, duration]), [
    ['endsOutside', hour], ['open', 0], ['night', 2 * hour]
  ])
  assert.equal(rows[2].sessionDuration, 14 * hour)
  assert.deepEqual(reportWarnings(rows[2]), ['Meer dan 12 uur', 'Toekomstige tijd'])
})

test('rapporttijden zijn lokaal en CSV houdt ingevulde namen als tekst', () => {
  assert.equal(reportSessionTimes(at('2026-03-29T10:00Z')), '12:00 – open')
  assert.match(reportSessionTimes(at('2026-03-29T19:00Z'), at('2026-03-29T23:00Z')), /^21:00 – .*01:00$/)
  assert.equal(reportCsv([['Naam; met "quotes"', '  =voorbeeld', '1,25']]), '\ufeff"Naam; met ""quotes""";"\'  =voorbeeld";"1,25"')
})
