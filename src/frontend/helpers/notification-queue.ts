export function mergeUnreadNotifications<T extends { id: string; userId: string; readAt?: string }>(
  current: T[], incoming: T[], userId: string, dismissed: ReadonlySet<string>
): T[] {
  const unique = new Map<string, T>()
  for (const item of [...current, ...incoming]) {
    if (item?.userId === userId && !item.readAt && !dismissed.has(item.id) && !unique.has(item.id)) {
      unique.set(item.id, item)
    }
  }
  return [...unique.values()]
}

export function notificationTarget(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('#!/') ? value : undefined
}
