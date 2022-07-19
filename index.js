#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve, sep } from 'node:path'
import { program } from 'commander'
import standard from 'standard'
import glob from 'glob'
import { rollup } from 'rollup'
import { terser } from 'rollup-plugin-terser'

const moduleDir = 'modules'
const buildDir = 'build'
const moduleEntry = 'lib.js'
const testEntry = 'test.js'

program
  .name('lib')
  .description('A simple library authoring tool.')
  .version('1.0.0')

program
  .command('lint')
  .description('Lints all module JavaScript.')
  .option('-d, --module-dir [path]', 'Path of the modules directory.', moduleDir)
  .action(async ({ moduleDir }) => {
    const results = await standard.lintFiles([`${moduleDir}/**/*.js`], { fix: true })

    console.log('TAP version 13')
    console.log(`1..${results.length}`)

    results.forEach((result, index) => {
      const filePath = relative(resolve(moduleDir), result.filePath)
      const testline = `ok ${index + 1} ${filePath}`

      console.log(result.messages.length === 0 ? testline : `not ${testline}`)
      result.messages.forEach(({ line, column, message, ruleId }) => {
        console.log(`# ${line}:${column} ${message} (${ruleId})`)
      })
    })

    process.exitCode = Number(results.flatMap(r => r.messages).length !== 0)
  })

program
  .command('test')
  .description('Runs all module tests.')
  .option('-d, --module-dir [path]', 'Path of the module directory.', moduleDir)
  .option('-f, --test-entry [filename]', 'Name of the test file.', testEntry)
  .argument('[args...]', 'Additional arguments to pass to the node child process invoking the tests.')
  .action(async (args, { moduleDir, testEntry }) => {
    const result = spawnSync('node', [
      '--input-type=module',
      '--experimental-network-imports',
      '--no-warnings',
      ...args
    ], {
      stdio: ['pipe', 'inherit', 'inherit'],
      input: glob.sync(`${moduleDir}/*/${testEntry}`).map(v => `import './${v}'`).join('\n')
    })

    process.exitCode = result.status
  })

program
  .command('build')
  .description('Compiles all modules.')
  .option('-d, --module-dir [path]', 'Path of the module directory.', moduleDir)
  .option('-b, --build-dir [path]', 'Path of the build directory.', buildDir)
  .option('-m, --module-entry [filename]', 'Name of the test file.', moduleEntry)
  .action(async ({ moduleDir, buildDir, moduleEntry }) => {
    const getModuleName = p => relative(resolve(moduleDir), p).split(sep).shift()

    const external = (id, parent) => {
      const target = resolve(resolve(moduleDir), dirname(parent), id)
      const isDifferentModule = getModuleName(parent) !== getModuleName(target)
      const isNetworkModule = /^https?:\/\//.test(id)
      return isNetworkModule || isDifferentModule
    }

    for (const input of glob.sync(`${moduleDir}/*/${moduleEntry}`)) {
      const bundle = await rollup({ external, input })

      await bundle.write({
        file: resolve(buildDir, input),
        format: 'esm',
        sourcemap: true,
        plugins: [terser()],
        sourcemapPathTransform (relativeSourcePath, sourcemapPath) {
          return relative(resolve(buildDir), resolve(sourcemapPath, relativeSourcePath))
        }
      })
    }
  })

await program.parseAsync()
