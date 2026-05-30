/**
 * Watch mode implementation for endpoint-tester CLI.
 *
 * Uses native Node.js fs.watch (no additional dependencies) to detect
 * file changes in the scanned directory and re-run the scan + test
 * generation pipeline automatically.
 *
 * @module
 */

import { watch, type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'
import { Scanner } from './scanner.js'
import { TestGenerator } from './generator.js'
import { OpenApiGenerator } from './openapi.js'
import { getAdapter } from './adapters/index.js'
import type { Framework, SupportedFormat } from './types.js'

export interface WatchModeOptions {
  directory: string
  framework: Framework
  output: string
  format: SupportedFormat
  baseUrl?: string
  exclude?: string[]
  /** Debounce delay in ms to coalesce rapid file system events. Default: 500 */
  debounceMs?: number
  /** Called on each successful regeneration */
  onRegenerate?: (endpointCount: number, outputFile: string) => void
  /** Called on scan/generation error */
  onError?: (err: Error) => void
}

/**
 * Start watch mode on a directory.
 *
 * Watches the directory recursively for file changes. On change, waits
 * for the debounce period, then re-runs the full scan + generate pipeline.
 *
 * @param options - Watch mode configuration
 * @returns A cleanup function that stops the watcher when called
 */
export async function startWatchMode(options: WatchModeOptions): Promise<() => void> {
  const {
    directory,
    framework,
    output,
    format,
    baseUrl = 'http://localhost:3000',
    exclude,
    debounceMs = 500,
    onRegenerate,
    onError,
  } = options

  const dir = resolve(directory)
  const adapter = getAdapter(framework)
  const scanner = new Scanner(adapter)
  const generator = new TestGenerator()
  const openApiGenerator = new OpenApiGenerator()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let isRunning = false

  async function runGeneration(): Promise<void> {
    if (isRunning) return // Prevent overlapping runs
    isRunning = true

    try {
      const timestamp = new Date().toISOString()
      console.log(`[watch] ${timestamp} Detected changes, regenerating...`)

      const endpoints = await scanner.scan({ directory: dir, framework, exclude })

      let outFile: string
      if (format === 'openapi') {
        const { extname, dirname: pathDirname, basename } = await import('node:path')
        const { writeFileSync, mkdirSync } = await import('node:fs')
        const outputExt = extname(output).toLowerCase()
        const isYaml = outputExt === '.yaml' || outputExt === '.yml'
        const specContent = openApiGenerator.generate(endpoints, {
          baseUrl,
          format: isYaml ? 'yaml' : 'json',
        })
        outFile = resolve(output)
        mkdirSync(pathDirname(outFile), { recursive: true })
        writeFileSync(outFile, specContent)
      } else {
        const { writeFileSync, mkdirSync } = await import('node:fs')
        const { extname, dirname: pathDirname } = await import('node:path')
        const outputExt = extname(output).toLowerCase()
        const testContent = generator.generate({ endpoints, output, format, baseUrl })
        outFile = resolve(output)
        mkdirSync(pathDirname(outFile), { recursive: true })
        writeFileSync(outFile, testContent)
      }

      const count = endpoints.length
      console.log(`[watch] Regenerated ${count} endpoint(s) -> ${outFile}`)
      onRegenerate?.(count, outFile)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error(`[watch] Error during regeneration: ${error.message}`)
      onError?.(error)
    } finally {
      isRunning = false
    }
  }

  // Run once immediately on start
  await runGeneration()

  const watcher: FSWatcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return

    // Ignore output file changes to avoid feedback loops
    if (resolve(dir, filename) === resolve(output)) return

    // Debounce: reset timer on each event
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runGeneration()
    }, debounceMs)
  })

  console.log(`[watch] Watching ${dir} for changes (${framework} adapter, ${format} output)...`)
  console.log(`[watch] Press Ctrl+C to stop.`)

  return function stopWatcher() {
    if (debounceTimer) clearTimeout(debounceTimer)
    watcher.close()
    console.log('[watch] Stopped.')
  }
}
