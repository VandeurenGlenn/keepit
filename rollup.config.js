import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { copyFile, readFile, writeFile, mkdir, cp } from 'fs/promises'
import materialSymbols from 'rollup-plugin-material-symbols'
import { glob } from 'fs/promises'
import { cssModules } from 'rollup-plugin-css-modules'
import terser from '@rollup/plugin-terser'
import template from 'rollup-plugin-html-literals'

const isProduction = process.env.NODE_ENV === 'production'

try {
  await copyFile('src/frontend/index.html', 'www/index.html')
} catch (error) {
  await mkdir('www', { recursive: true })
  await copyFile('src/frontend/index.html', 'www/index.html')
}

await cp('node_modules/@vandeurenglenn/lite-elements/exports/themes', 'www/themes', { recursive: true })
await cp('src/assets', 'www/assets', { recursive: true })
const views = await Array.fromAsync(glob('src/frontend/views/*.ts'))

const rollupTransformCode = (searchValue, replaceValue) => {
  return {
    name: 'rollup-replacement',
    transform(code) {
      return {
        code: code.replace(new RegExp(searchValue, 'g'), replaceValue),
        map: null
      }
    }
  }
}

const pkg = JSON.parse(await readFile('./package.json', 'utf-8'))

const rollupUpdateBuildInfo = () => {
  return {
    name: 'rollup-update-build-info',
    buildStart() {
      if (isProduction) {
        if (pkg.build.version !== pkg.version) {
          pkg.build.current = 0
          pkg.build.version = pkg.version
        }
        pkg.build.current++
        pkg.build.date = Date.now()
      }
    },
    async buildEnd(error) {
      if (isProduction && !error) {
        await writeFile('./package.json', JSON.stringify(pkg, null, 2))
        console.log(`Built version ${pkg.build.version} (build ${pkg.build.current})`)
      }
    },
    transform(code) {
      console.log(pkg.build)

      return {
        code: code.replaceAll('// @build', `globalThis.__keepit__ = { build:  ${JSON.stringify(pkg.build)} }`),
        map: null
      }
    }
  }
}

export default [
  {
    input: ['src/frontend/shell.ts', ...views],
    output: {
      dir: 'www',
      format: 'es'
    },

    plugins: [
      rollupUpdateBuildInfo(),
      cssModules(),
      template(),
      nodeResolve(),
      typescript(),
      terser(),
      materialSymbols({ placeholderPrefix: 'symbol' })
    ]
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
