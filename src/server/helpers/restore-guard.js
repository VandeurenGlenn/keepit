export function createRestoreGuard() {
  let restoring = false
  let requests = 0
  /** @type {(() => void) | undefined} */
  let drained

  return {
    isRestoring: () => restoring,
    enterRequest() {
      if (restoring) return undefined
      requests++
      return () => {
        if (--requests === 0) drained?.()
      }
    },
    beginRestore() {
      if (restoring) return undefined
      restoring = true
      return {
        ready: requests === 0 ? Promise.resolve() : new Promise((resolve) => { drained = () => resolve(undefined) }),
        release: () => {
          drained = undefined
          restoring = false
        }
      }
    }
  }
}

export const restoreGuard = createRestoreGuard()

/**
 * @template T
 * @param {string[]} datasets
 * @param {Record<string, T>} incoming
 * @param {Record<string, T>} previous
 * @param {(name: string, data: T) => Promise<unknown>} write
 */
export async function persistRestore(datasets, incoming, previous, write) {
  /** @param {Record<string, T>} source */
  const writeAll = (source) =>
    Promise.allSettled(datasets.map(async (name) => write(name, source[name])))
  const results = await writeAll(incoming)
  if (results.every((result) => result.status === 'fulfilled')) return { restored: true }

  const rolledBack = await writeAll(previous)
  return {
    restored: false,
    failedRollback: datasets.filter((_, index) => rolledBack[index].status === 'rejected')
  }
}
