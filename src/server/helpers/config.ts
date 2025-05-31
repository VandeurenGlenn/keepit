import { readFile } from 'fs/promises'

export const config = JSON.parse((await readFile('./server.config.json')).toString())
