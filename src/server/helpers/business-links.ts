import type { Hours, Invoices, Jobs, PlanningEntries } from '../../types/index.js'

export function companyLinks(id: string, jobs: Jobs, invoices: Invoices) {
  return {
    jobs: Object.values(jobs).filter((job) => job.customerId === id).length,
    invoices: Object.values(invoices).filter((invoice) => invoice.company === id).length
  }
}

export function jobArchiveBlockers(id: string, hours: Hours, planning: PlanningEntries, now = Date.now()) {
  let open = 0
  for (const entries of Object.values(hours)) {
    for (const entry of Object.values(entries || {})) {
      if (entry.jobId === id && entry.checkout == null) open++
    }
  }
  const scheduled = Object.values(planning).filter((entry) => entry.jobId === id && Date.parse(entry.end) > now).length
  return [
    ...(open ? [{ kind: 'open-hours' as const, message: `${open} openstaande urenregistratie(s)`, blocking: true }] : []),
    ...(scheduled ? [{ kind: 'planning' as const, message: `${scheduled} lopende of toekomstige planning(en)`, blocking: true }] : [])
  ]
}
