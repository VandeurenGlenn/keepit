const dirtyScopes = new Set<string>()
let bound = false

const bindBeforeUnload = () => {
  if (bound) return
  bound = true
  window.addEventListener('beforeunload', (event) => {
    if (!dirtyScopes.size) return
    event.preventDefault()
    event.returnValue = ''
  })
}

export const setUnsavedChanges = (scope: string, dirty: boolean) => {
  bindBeforeUnload()
  if (dirty) dirtyScopes.add(scope)
  else dirtyScopes.delete(scope)
}

export const clearUnsavedChanges = () => dirtyScopes.clear()
export const hasUnsavedChanges = () => dirtyScopes.size > 0
