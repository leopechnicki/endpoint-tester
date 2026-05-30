/**
 * CI integration mode for endpoint-tester.
 *
 * Enables baseline-based regression detection: saves a baseline of discovered
 * endpoints on first run, then compares on subsequent runs and exits with code 1
 * if fewer endpoints are detected (preventing silent endpoint deletion).
 *
 * @module
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Endpoint } from './types.js'

/** Shape of the baseline file */
export interface EndpointBaseline {
  version: number
  createdAt: string
  updatedAt: string
  framework: string
  directory: string
  endpointCount: number
  endpoints: Array<{ method: string; path: string }>
}

export interface CiModeOptions {
  /** Directory that was scanned */
  directory: string
  /** Framework that was used */
  framework: string
  /** Detected endpoints from the current scan */
  currentEndpoints: Endpoint[]
  /** Path to the baseline file. Default: .endpoint-tester-baseline.json */
  baselinePath?: string
  /** If true, always save/overwrite the baseline (--update-baseline flag) */
  updateBaseline?: boolean
}

export interface CiModeResult {
  /** true if the check passed (no regression), false if fewer endpoints detected */
  passed: boolean
  /** Human-readable status message */
  message: string
  /** 'created' | 'updated' | 'passed' | 'failed' */
  status: 'created' | 'updated' | 'passed' | 'failed'
  /** Baseline endpoint count (null if no baseline existed) */
  baselineCount: number | null
  /** Current endpoint count */
  currentCount: number
  /** Endpoints present in baseline but missing from current scan */
  missingEndpoints: Array<{ method: string; path: string }>
}

/**
 * Run CI mode endpoint baseline check.
 *
 * Behavior:
 * - If no baseline file exists: create one, exit 0 (first run)
 * - If baseline exists and current >= baseline count: pass, exit 0
 * - If baseline exists and current < baseline count: fail with diff, exit 1
 * - If --update-baseline: overwrite baseline, always exit 0
 *
 * @param options - CI mode options
 * @returns CiModeResult describing the outcome
 */
export function runCiMode(options: CiModeOptions): CiModeResult {
  const {
    directory,
    framework,
    currentEndpoints,
    baselinePath = '.endpoint-tester-baseline.json',
    updateBaseline = false,
  } = options

  const absoluteBaselinePath = resolve(baselinePath)
  const currentCount = currentEndpoints.length
  const currentSummary = currentEndpoints.map((e) => ({ method: e.method, path: e.path }))

  // If --update-baseline, always write and return success
  if (updateBaseline) {
    const baseline = createBaseline(directory, framework, currentEndpoints, absoluteBaselinePath)
    return {
      passed: true,
      message: `Baseline updated: ${currentCount} endpoint(s) saved to ${absoluteBaselinePath}`,
      status: 'updated',
      baselineCount: currentCount,
      currentCount,
      missingEndpoints: [],
    }
  }

  // If no baseline exists, create it
  if (!existsSync(absoluteBaselinePath)) {
    createBaseline(directory, framework, currentEndpoints, absoluteBaselinePath)
    return {
      passed: true,
      message: `Baseline created: ${currentCount} endpoint(s) saved to ${absoluteBaselinePath}. Future runs will compare against this baseline.`,
      status: 'created',
      baselineCount: null,
      currentCount,
      missingEndpoints: [],
    }
  }

  // Load and compare against existing baseline
  let baseline: EndpointBaseline
  try {
    const raw = readFileSync(absoluteBaselinePath, 'utf-8')
    baseline = JSON.parse(raw) as EndpointBaseline
  } catch (err) {
    const msg = `Could not read baseline at ${absoluteBaselinePath}: ${err instanceof Error ? err.message : String(err)}`
    return {
      passed: false,
      message: msg,
      status: 'failed',
      baselineCount: null,
      currentCount,
      missingEndpoints: [],
    }
  }

  const baselineCount = baseline.endpointCount
  const baselineSet = new Set(baseline.endpoints.map((e) => `${e.method}:${e.path}`))
  const currentSet = new Set(currentSummary.map((e) => `${e.method}:${e.path}`))

  const missingEndpoints = baseline.endpoints.filter(
    (e) => !currentSet.has(`${e.method}:${e.path}`)
  )

  if (currentCount < baselineCount) {
    const lines = [
      `CI check FAILED: ${currentCount} endpoint(s) detected, expected at least ${baselineCount}.`,
      `${missingEndpoints.length} endpoint(s) from baseline are missing:`,
      ...missingEndpoints.map((e) => `  - ${e.method} ${e.path}`),
      ``,
      `If this is intentional, run with --update-baseline to refresh the baseline.`,
    ]
    return {
      passed: false,
      message: lines.join('\n'),
      status: 'failed',
      baselineCount,
      currentCount,
      missingEndpoints,
    }
  }

  return {
    passed: true,
    message: `CI check passed: ${currentCount} endpoint(s) detected (baseline: ${baselineCount}).`,
    status: 'passed',
    baselineCount,
    currentCount,
    missingEndpoints: [],
  }
}

function createBaseline(
  directory: string,
  framework: string,
  endpoints: Endpoint[],
  path: string
): EndpointBaseline {
  const now = new Date().toISOString()
  const baseline: EndpointBaseline = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    framework,
    directory,
    endpointCount: endpoints.length,
    endpoints: endpoints.map((e) => ({ method: e.method, path: e.path })),
  }
  writeFileSync(path, JSON.stringify(baseline, null, 2) + '\n')
  return baseline
}
