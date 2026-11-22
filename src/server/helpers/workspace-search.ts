export function normalizeWorkspaceSearch(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('nl')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function workspaceSearchRank(query: string, title: string, ...fields: Array<string | undefined>): number {
  if (!query) return 0
  const name = normalizeWorkspaceSearch(title || '')
  if (name === query) return 5
  if (name.startsWith(query)) return 4
  const words = query.split(' ')
  if (words.every((word) => name.includes(word))) return 3
  const details = fields.map((value) => normalizeWorkspaceSearch(value || '')).join(' ')
  if (words.every((word) => `${name} ${details}`.includes(word))) return 2
  return 0
}
