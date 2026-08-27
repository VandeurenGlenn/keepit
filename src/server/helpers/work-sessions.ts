import type { Prestation } from '../../types/index.js'

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
