import type { Hours, WorkReport } from '../../types/index.js'

const dayMs = 86_400_000
const datePattern = /^\d{4}-\d\d-\d\d$/
const brusselsClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
})

function isoDay(value: string): number {
  if (!datePattern.test(value)) return NaN
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN
}

function brusselsMidnight(utcDay: number): number {
  // At midnight in Brussels the offset is stable across the surrounding UTC hours.
  const parts = Object.fromEntries(brusselsClock.formatToParts(utcDay).map(({ type, value }) => [type, value]))
  const localAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
  return utcDay - (localAsUtc - utcDay)
}

export function resolveReportPeriod(from: string, to: string): { from: number; to: number } | undefined {
  // Date-only requests specify inclusive calendar days; older clients send instants.
  if (datePattern.test(from) || datePattern.test(to)) {
    const first = isoDay(from)
    const last = isoDay(to)
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first >= 366 * dayMs) return
    const start = brusselsMidnight(first)
    const end = brusselsMidnight(last + dayMs)
    if (Number.isFinite(start) && Number.isFinite(end)) return { from: start, to: end }
    return
  }
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 366 * dayMs) {
    return { from: start, to: end }
  }
}

export function buildWorkReport(hours: Hours, from: number, to: number): WorkReport {
  const rows: WorkReport['rows'] = []
  for (const [userId, userHours] of Object.entries(hours)) {
    for (const [prestationId, item] of Object.entries(userHours || {})) {
      const { checkin, checkout } = item
      if (!Number.isFinite(checkin) || checkin >= to) continue
      if (checkout === undefined) {
        if (checkin < from) continue
      } else if (!Number.isFinite(checkout) || checkout < checkin || (checkin < from && checkout <= from)) {
        continue
      }
      const sessionDuration = checkout === undefined ? 0 : checkout - checkin
      const duration = checkout === undefined ? 0 : Math.max(0, Math.min(to, checkout) - Math.max(from, checkin))
      rows.push({
        userId, jobId: item.jobId || '', prestationId, checkin, checkout, duration, sessionDuration,
        unusual: sessionDuration > 12 * 3_600_000,
        future: checkin > Number(item.serverCheckin) || (checkout !== undefined && checkout > Number(item.serverCheckout))
      })
    }
  }
  rows.sort((a, b) => b.checkin - a.checkin)
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), rows }
}
