import { readFile } from 'node:fs/promises'

export const readJsonFile = async (file: string): Promise<unknown | undefined> => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Keepit kan ${file} niet veilig lezen: ${reason}`)
  }
}
