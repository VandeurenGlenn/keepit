import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { copyFile, mkdir, cp } from 'fs/promises'
import materialSymbols from 'rollup-plugin-material-symbols'
import { glob } from 'fs/promises'
import { cssModules } from 'rollup-plugin-css-modules'

try {
  await copyFile('src/frontend/index.html', 'www/index.html')
} catch (error) {
  await mkdir('www', { recursive: true })
  await copyFile('src/frontend/index.html', 'www/index.html')
}

await cp('node_modules/@vandeurenglenn/lite-elements/exports/themes', 'www/themes', { recursive: true })
await cp('src/assets', 'www/assets', { recursive: true })
const views = await Array.fromAsync(glob('src/frontend/views/*.ts'))

export default [
  {
    input: ['src/frontend/shell.ts', ...views],
    output: {
      dir: 'www',
      format: 'es'
    },

    plugins: [cssModules(), nodeResolve(), typescript(), materialSymbols({ placeholderPrefix: 'symbol' })]
  },
  {
    input: ['src/server/server.ts'],
    output: {
      dir: 'server',
      format: 'es'
    },
    plugins: [typescript({ compilerOptions: { outDir: 'server' } })]
  }
]
