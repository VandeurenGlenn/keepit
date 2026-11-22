import type { WorkReport } from '../../types/index.js'

const timeZone = 'Europe/Brussels'
const day = new Intl.DateTimeFormat('sv-SE', { timeZone })
export const reportDay = (date: Date) => day.format(date)
const dateTime = new Intl.DateTimeFormat('nl-BE', { timeZone, dateStyle: 'short', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('nl-BE', { timeZone, dateStyle: 'medium' })
const timeOnly = new Intl.DateTimeFormat('nl-BE', { timeZone, hour: '2-digit', minute: '2-digit' })

export const reportDateTime = (value: number) => dateTime.format(value)
export const reportDate = (value: number) => dateOnly.format(value)
export const reportDayLabel = (day: string) => reportDate(Date.parse(`${day}T12:00:00Z`))

export function reportSessionTimes(checkin: number, checkout?: number) {
  const start = timeOnly.format(checkin)
  if (checkout === undefined) return `${start} – open`
  return `${start} – ${reportDay(new Date(checkin)) === reportDay(new Date(checkout)) ? timeOnly.format(checkout) : reportDateTime(checkout)}`
}

export function reportWarnings(row: WorkReport['rows'][number]) {
  return [row.unusual ? 'Meer dan 12 uur' : '', row.future ? 'Toekomstige tijd' : ''].filter(Boolean)
}

export function reportCsv(rows: string[][]) {
  return '\ufeff' + rows.map((line) => line.map((value) => {
    // User-entered names are labels, never spreadsheet formulas.
    const text = /^[\s\uFEFF]*[=+@-]/u.test(value) ? `'${value}` : value
    return `"${text.replaceAll('"', '""')}"`
  }).join(';')).join('\r\n')
}
