import type { AppNotification, PlanningEntry } from '../../types/index.js'
import { jobs, notifications, notificationsStore, users } from '../database/database.js'
import pubsub from './pubsub.js'
import { sendMail } from './mailer.js'

type Change = 'created' | 'updated' | 'cancelled'
type PendingPlanningNotification = {
  timer: ReturnType<typeof setTimeout>
  previous: PlanningEntry
  latest: PlanningEntry
}

const configuredDelay = Number(process.env.KEEPIT_PLANNING_NOTIFICATION_DELAY_MS)
export const PLANNING_NOTIFICATION_DELAY_MS =
  Number.isFinite(configuredDelay) && configuredDelay >= 0 ? configuredDelay : 60_000
const pendingPlanningNotifications = new Map<string, PendingPlanningNotification>()

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

const dateFormatter = new Intl.DateTimeFormat('nl-BE', {
    dateStyle: 'full',
    timeZone: 'Europe/Brussels'
})

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Brussels'
})

const scheduleLabel = (entry: PlanningEntry) => {
  const start = new Date(entry.start)
  const end = new Date(entry.end)
  const sameDay = dateFormatter.format(start) === dateFormatter.format(end)
  return sameDay
    ? `${dateFormatter.format(start)}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
    : `${dateFormatter.format(start)} ${timeFormatter.format(start)} – ${dateFormatter.format(end)} ${timeFormatter.format(end)}`
}

const attendeeNames = (entry: PlanningEntry) =>
  entry.userIds.map((id) => users[id]?.name || users[id]?.email || 'Onbekende medewerker')

const materialLabels = (entry: PlanningEntry) =>
  (jobs[entry.jobId]?.materials || []).map((material) => {
    const quantity = Number.isFinite(Number(material.quantity)) ? Number(material.quantity) : 1
    return `${quantity} ${material.unit || 'st.'} ${material.name}`.trim()
  })

const changedFields = (entry: PlanningEntry, previous?: PlanningEntry): string[] => {
  if (!previous) return []
  const changes: string[] = []
  if (entry.jobId !== previous.jobId) {
    changes.push(`job: ${jobs[previous.jobId]?.name || 'onbekend'} → ${jobs[entry.jobId]?.name || 'onbekend'}`)
  }
  if (entry.start !== previous.start || entry.end !== previous.end) changes.push(`moment: ${scheduleLabel(entry)}`)

  const added = entry.userIds.filter((id) => !previous.userIds.includes(id)).map((id) => users[id]?.name || users[id]?.email || id)
  const removed = previous.userIds.filter((id) => !entry.userIds.includes(id)).map((id) => users[id]?.name || users[id]?.email || id)
  if (added.length) changes.push(`toegevoegd: ${added.join(', ')}`)
  if (removed.length) changes.push(`verwijderd: ${removed.join(', ')}`)
  if ((entry.notes || '') !== (previous.notes || '')) changes.push('notities aangepast')
  return changes
}

const shortValue = (value: string, maximum = 180) =>
  value.length > maximum ? `${value.slice(0, maximum - 1).trimEnd()}…` : value

const copyFor = (change: Change, entry: PlanningEntry, previous?: PlanningEntry) => {
  const jobName = jobs[entry.jobId]?.name || 'een job'
  const people = attendeeNames(entry).join(', ') || 'niemand'
  const materials = materialLabels(entry)
  const notes = entry.notes || 'geen'
  const details = `Aanwezig: ${people}. Notities: ${shortValue(notes)}. Materiaal: ${
    materials.length ? `${materials.slice(0, 4).join(', ')}${materials.length > 4 ? ` +${materials.length - 4}` : ''}` : 'geen'
  }.`

  if (change === 'created') {
    return {
      title: 'Nieuwe planning',
      message: `${jobName} · ${scheduleLabel(entry)}. ${details}`
    }
  }
  if (change === 'cancelled') {
    return {
      title: 'Planning geannuleerd',
      message: `${jobName} · ${scheduleLabel(entry)} werd geannuleerd. ${details}`
    }
  }
  const changes = changedFields(entry, previous)
  return {
    title: 'Planning gewijzigd',
    message: `${jobName}. ${changes.length ? `Gewijzigd: ${changes.join(' · ')}. ` : ''}${details}`
  }
}

const emailHtml = (change: Change, entry: PlanningEntry, title: string, message: string, previous?: PlanningEntry) => {
  const job = jobs[entry.jobId]
  const people = attendeeNames(entry)
  const materials = materialLabels(entry)
  const changes = change === 'updated' ? changedFields(entry, previous) : []

  return `
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
    ${changes.length ? `<h3>Wat is gewijzigd?</h3><ul>${changes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    <h3>Planning</h3>
    <ul>
      <li><strong>Job:</strong> ${escapeHtml(job?.name || 'Onbekende job')}</li>
      <li><strong>Wanneer:</strong> ${escapeHtml(scheduleLabel(entry))}</li>
      <li><strong>Werf:</strong> ${escapeHtml(job?.place?.formattedAddress || 'Geen werfadres ingesteld')}</li>
    </ul>
    <h3>Aanwezig op de werf</h3>
    ${people.length ? `<ul>${people.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>` : '<p>Niemand toegewezen.</p>'}
    <h3>Notities</h3>
    <p>${escapeHtml(entry.notes || 'Geen notities toegevoegd.')}</p>
    <h3>Materiaal</h3>
    ${materials.length ? `<ul>${materials.map((material) => `<li>${escapeHtml(material)}</li>`).join('')}</ul>` : '<p>Geen materiaal aan deze job gekoppeld.</p>'}
    <p><a href="https://keepit.dimac.be/#!/planning">Bekijk je planning in Keepit</a></p>
  `
}

export const notifyPlanningUsers = async (
  entry: PlanningEntry,
  change: Change,
  recipients = entry.userIds,
  previous?: PlanningEntry
) => {
  const uniqueRecipients = [...new Set(recipients)].filter((id) => users[id])
  if (!uniqueRecipients.length) return

  const { title, message } = copyFor(change, entry, previous)
  const createdAt = new Date().toISOString()
  const created: AppNotification[] = uniqueRecipients.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    type: `planning-${change}`,
    title,
    message,
    url: '#!/planning',
    createdAt
  }))

  for (const notification of created) {
    const items = (notifications[notification.userId] ||= [])
    items.push(notification)
    if (items.length > 100) items.splice(0, items.length - 100)
  }
  await notificationsStore.put(notifications)

  for (const notification of created) {
    pubsub.publish(`notifications.${notification.userId}`, notification)
    const email = users[notification.userId]?.email
    if (!email) continue
    void sendMail(
      'keepit@dimac.be',
      email,
      notification.title,
      emailHtml(change, entry, notification.title, notification.message, previous)
    ).catch((error) => console.warn(`Planning email to ${email} failed`, error instanceof Error ? error.message : error))
  }
}

const entriesMatch = (left: PlanningEntry, right: PlanningEntry) =>
  left.jobId === right.jobId &&
  left.start === right.start &&
  left.end === right.end &&
  (left.notes || '') === (right.notes || '') &&
  [...left.userIds].sort().join('\u0000') === [...right.userIds].sort().join('\u0000')

const flushPlanningUpdateNotification = async (id: string) => {
  const pending = pendingPlanningNotifications.get(id)
  if (!pending) return
  pendingPlanningNotifications.delete(id)
  if (entriesMatch(pending.previous, pending.latest)) return

  const addedUsers = pending.latest.userIds.filter((userId) => !pending.previous.userIds.includes(userId))
  const removedUsers = pending.previous.userIds.filter((userId) => !pending.latest.userIds.includes(userId))
  const retainedUsers = pending.latest.userIds.filter((userId) => pending.previous.userIds.includes(userId))
  await Promise.all([
    notifyPlanningUsers(pending.latest, 'created', addedUsers),
    notifyPlanningUsers(pending.previous, 'cancelled', removedUsers),
    notifyPlanningUsers(pending.latest, 'updated', retainedUsers, pending.previous)
  ])
}

export const schedulePlanningUpdateNotification = (previous: PlanningEntry, latest: PlanningEntry) => {
  const existing = pendingPlanningNotifications.get(latest.id)
  if (existing) clearTimeout(existing.timer)

  const baseline = existing?.previous || structuredClone(previous)
  const finalEntry = structuredClone(latest)
  const timer = setTimeout(() => {
    void flushPlanningUpdateNotification(latest.id).catch((error) =>
      console.warn('Delayed planning notification failed', error instanceof Error ? error.message : error)
    )
  }, PLANNING_NOTIFICATION_DELAY_MS)
  timer.unref?.()
  pendingPlanningNotifications.set(latest.id, { timer, previous: baseline, latest: finalEntry })
}

export const cancelScheduledPlanningNotification = (id: string) => {
  const pending = pendingPlanningNotifications.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingPlanningNotifications.delete(id)
}
