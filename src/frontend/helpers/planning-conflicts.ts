import type { PlanningEntry } from '../../types/index.js'

export type PlanningConflict = {
  kind: 'overlap' | 'travel-time'
  entry: PlanningEntry
  userIds: string[]
}

export const findPlanningConflicts = (
  entries: PlanningEntry[],
  candidate: Pick<PlanningEntry, 'userIds' | 'jobId' | 'start' | 'end'>,
  editingId = '',
  minimumTravelMinutes = 30
): PlanningConflict[] => {
  const start = Date.parse(candidate.start)
  const end = Date.parse(candidate.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  const travelWindow = minimumTravelMinutes * 60_000

  return entries.reduce<PlanningConflict[]>((conflicts, entry) => {
    if (entry.id === editingId) return conflicts
    const sharedUsers = entry.userIds.filter((id) => candidate.userIds.includes(id))
    if (!sharedUsers.length) return conflicts
    const entryStart = Date.parse(entry.start)
    const entryEnd = Date.parse(entry.end)
    if (start < entryEnd && end > entryStart) conflicts.push({ kind: 'overlap', entry, userIds: sharedUsers })
    const gap = Math.min(Math.abs(start - entryEnd), Math.abs(entryStart - end))
    if (!(start < entryEnd && end > entryStart) && candidate.jobId !== entry.jobId && gap < travelWindow) conflicts.push({ kind: 'travel-time', entry, userIds: sharedUsers })
    return conflicts
  }, [])
}
