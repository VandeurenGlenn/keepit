const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLocaleLowerCase('nl-BE')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

export function directorySearch(query: string) {
  const words = normalize(query).split(' ').filter(Boolean)
  return (...fields: Array<string | undefined>) => {
    if (!words.length) return true
    const text = normalize(fields.filter(Boolean).join(' '))
    return words.every(word => text.includes(word))
  }
}
