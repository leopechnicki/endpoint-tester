import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCiMode } from '../src/ci-mode.js'
import type { Endpoint } from '../src/types.js'

// Mock fs module
const mockStore = new Map<string, string>()

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (path: string) => mockStore.has(path),
    readFileSync: (path: string, encoding: string) => {
      const content = mockStore.get(path)
      if (!content) throw new Error(`ENOENT: no such file '${path}'`)
      return content
    },
    writeFileSync: (path: string, content: string) => {
      mockStore.set(path, content)
    },
  }
})

const BASELINE_PATH = '/test/.endpoint-tester-baseline.json'

const SAMPLE_ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/users', handler: 'getUsers', params: [] },
  { method: 'POST', path: '/users', handler: 'createUser', params: [] },
  { method: 'GET', path: '/users/:id', handler: 'getUser', params: [{ name: 'id', location: 'path' }] },
]

describe('runCiMode', () => {
  beforeEach(() => {
    mockStore.clear()
  })

  describe('first run (no baseline)', () => {
    it('creates a baseline file and returns status created', () => {
      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS,
        baselinePath: BASELINE_PATH,
      })

      expect(result.status).toBe('created')
      expect(result.passed).toBe(true)
      expect(result.currentCount).toBe(3)
      expect(result.baselineCount).toBeNull()
      expect(mockStore.has(BASELINE_PATH)).toBe(true)
    })

    it('saves correct baseline content', () => {
      runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS,
        baselinePath: BASELINE_PATH,
      })

      const baseline = JSON.parse(mockStore.get(BASELINE_PATH)!)
      expect(baseline.endpointCount).toBe(3)
      expect(baseline.framework).toBe('express')
      expect(baseline.endpoints).toHaveLength(3)
      expect(baseline.version).toBe(1)
    })
  })

  describe('subsequent runs with baseline', () => {
    beforeEach(() => {
      // Create initial baseline
      runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS,
        baselinePath: BASELINE_PATH,
      })
    })

    it('passes when same number of endpoints', () => {
      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS,
        baselinePath: BASELINE_PATH,
      })

      expect(result.passed).toBe(true)
      expect(result.status).toBe('passed')
      expect(result.currentCount).toBe(3)
      expect(result.baselineCount).toBe(3)
    })

    it('passes when more endpoints detected than baseline', () => {
      const moreEndpoints: Endpoint[] = [
        ...SAMPLE_ENDPOINTS,
        { method: 'DELETE', path: '/users/:id', handler: 'deleteUser', params: [] },
      ]

      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: moreEndpoints,
        baselinePath: BASELINE_PATH,
      })

      expect(result.passed).toBe(true)
    })

    it('fails when fewer endpoints detected than baseline', () => {
      const fewerEndpoints = SAMPLE_ENDPOINTS.slice(0, 1) // Only 1 endpoint

      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: fewerEndpoints,
        baselinePath: BASELINE_PATH,
      })

      expect(result.passed).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.currentCount).toBe(1)
      expect(result.baselineCount).toBe(3)
    })

    it('reports missing endpoints in failure result', () => {
      const fewerEndpoints = SAMPLE_ENDPOINTS.slice(0, 1) // Keep only GET /users

      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: fewerEndpoints,
        baselinePath: BASELINE_PATH,
      })

      expect(result.missingEndpoints).toHaveLength(2)
      const missingPaths = result.missingEndpoints.map((e) => `${e.method}:${e.path}`)
      expect(missingPaths).toContain('POST:/users')
      expect(missingPaths).toContain('GET:/users/:id')
    })
  })

  describe('--update-baseline flag', () => {
    it('overwrites existing baseline and returns status updated', () => {
      // Create initial baseline with 3 endpoints
      runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS,
        baselinePath: BASELINE_PATH,
      })

      // Update to 1 endpoint
      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS.slice(0, 1),
        baselinePath: BASELINE_PATH,
        updateBaseline: true,
      })

      expect(result.passed).toBe(true)
      expect(result.status).toBe('updated')
      expect(result.currentCount).toBe(1)

      // Verify the baseline was actually updated
      const baseline = JSON.parse(mockStore.get(BASELINE_PATH)!)
      expect(baseline.endpointCount).toBe(1)
    })
  })

  describe('default baseline path', () => {
    it('uses .endpoint-tester-baseline.json by default', () => {
      // Reset mock to check default path behavior
      const result = runCiMode({
        directory: '/test/src',
        framework: 'express',
        currentEndpoints: SAMPLE_ENDPOINTS,
        // No baselinePath — uses default
      })

      // Should succeed (creates baseline)
      expect(result.passed).toBe(true)
    })
  })
})
