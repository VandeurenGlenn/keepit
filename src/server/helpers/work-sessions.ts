import type { Prestation } from '../../types/index.js'

export type ActiveWorkSession = { id: string; prestation: Prestation }

export const findActiveWorkSession = (
  preferredId: string | undefined,
  userHours: Record<string, Prestation>
): ActiveWorkSession | undefined => {
  if (preferredId) {
    const preferred = userHours[preferredId]
    if (preferred && !preferred.checkout) return { id: preferredId, prestation: preferred }
  }

  return Object.entries(userHours)
    .filter(([, prestation]) => !prestation.checkout && Boolean(prestation.jobId))
    .sort(([, left], [, right]) => Number(right.checkin) - Number(left.checkin))
    .map(([id, prestation]) => ({ id, prestation }))[0]
}

export const findOpenPrestationId = (
  preferredId: string | undefined,
  jobId: string,
  jobPrestationIds: string[],
  userHours: Record<string, Prestation>
): string | undefined => {
  if (preferredId) {
    const preferred = userHours[preferredId]
    if (preferred?.jobId === jobId && !preferred.checkout) return preferredId
  }
  return [...jobPrestationIds].reverse().find((id) => {
    const prestation = userHours[id]
    return prestation?.jobId === jobId && !prestation.checkout
  })
}

export const hasOverlappingWorkSession = (
  userHours: Record<string, Prestation>,
  checkin: number,
  checkout: number
): boolean => Object.values(userHours).some((entry) => {
  const existingStart = Number(entry.checkin)
  const existingEnd = entry.checkout === undefined ? Number.POSITIVE_INFINITY : Number(entry.checkout)
  return Number.isFinite(existingStart) && checkin < existingEnd && checkout > existingStart
})
