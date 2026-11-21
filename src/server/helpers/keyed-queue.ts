export function createKeyedQueue() {
  const pending = new Map<string, Promise<void>>()
  return async function run<T>(quoteId: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(quoteId)
    const current = (previous ?? Promise.resolve()).then(operation)
    const settled = current.then(() => undefined, () => undefined)
    pending.set(quoteId, settled)
    try {
      return await current
    } finally {
      if (pending.get(quoteId) === settled) pending.delete(quoteId)
    }
  }
}
