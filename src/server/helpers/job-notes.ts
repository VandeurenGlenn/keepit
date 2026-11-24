import type { JobNote } from '../../types/index.js'

export function appendJobNote(notes: JobNote[], note: JobNote) {
  const existing = notes.find(({ id }) => id === note.id)
  if (!existing) return { notes: [...notes, note], created: true }
  if (existing.author !== note.author || existing.text !== note.text) return undefined
  return { notes, created: false }
}
