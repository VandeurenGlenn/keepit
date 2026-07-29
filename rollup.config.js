import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { copyFile, readFile, writeFile, mkdir, cp, readdir, rm } from 'fs/promises'
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
      }
    },
    transform(code) {
      return {
        code: code.replaceAll('// @build', `globalThis.__keepit__ = { build:  ${JSON.stringify(pkg.build)} }`),
        map: null
      }
    }
  }
}

const rollupCleanupPreviousBuild = ({ dir, keepExtensions = [] }) => {
  return {
    name: `rollup-cleanup-previous-build-${dir}`,
    async buildStart() {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      const filesToRemove = entries.filter((entry) => {
        if (!entry.isFile()) {
          return false
        }

        return !keepExtensions.some((extension) => entry.name.endsWith(extension))
      })

      await Promise.all(filesToRemove.map((entry) => rm(`${dir}/${entry.name}`, { force: true })))
    }
  }
}

export default [
  {
    input: ['src/frontend/shell.ts', 'src/frontend/service-worker.ts', ...views],
    output: {
      dir: 'www',
      format: 'es'
    },

    plugins: [
      rollupUpdateBuildInfo(),
      rollupCleanupPreviousBuild({ dir: 'www', keepExtensions: ['.html'] }),
      cssModules(),
      template(),
      nodeResolve(),
      typescript(),
      terser(),
      materialSymbols({ placeholderPrefix: 'symbol' })
    ]
  },
  {
    input: ['src/server/server.ts', 'src/server/cli.ts'],
    output: {
      dir: 'server',
      format: 'es'
    },
    plugins: [rollupCleanupPreviousBuild({ dir: 'server' }), typescript({ compilerOptions: { outDir: 'server' } })]
  }
]
