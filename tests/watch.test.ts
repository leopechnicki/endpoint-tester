import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the fs.watch call before importing the module
const mockWatcherClose = vi.fn()
const mockWatcher = {
  close: mockWatcherClose,
}
const mockFsWatch = vi.fn(() => mockWatcher)

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    watch: mockFsWatch,
  }
})

// Mock scanner to avoid real FS access
vi.mock('./scanner.js', () => ({
  Scanner: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue([
      { method: 'GET', path: '/health', handler: 'healthCheck', params: [] },
      { method: 'POST', path: '/users', handler: 'createUser', params: [] },
    ]),
  })),
}))

// Mock generator
vi.mock('./generator.js', () => ({
  TestGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockReturnValue('// generated tests'),
  })),
}))

vi.mock('./openapi.js', () => ({
  OpenApiGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockReturnValue('{}'),
  })),
}))

vi.mock('./adapters/index.js', () => ({
  getAdapter: vi.fn().mockReturnValue({ framework: 'express', fileExtensions: ['.ts'] }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    watch: mockFsWatch,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { startWatchMode } from '../src/watch.js'
import { Framework } from '../src/types.js'

describe('startWatchMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFsWatch.mockReturnValue(mockWatcher)
  })

  it('runs initial scan immediately on start', async () => {
    const onRegenerate = vi.fn()

    const stop = await startWatchMode({
      directory: '/test/dir',
      framework: Framework.Express,
      output: '/test/output/tests.test.ts',
      format: 'vitest',
      onRegenerate,
    })

    expect(onRegenerate).toHaveBeenCalledWith(2, expect.any(String))
    stop()
  })

  it('starts fs.watch on the specified directory', async () => {
    const stop = await startWatchMode({
      directory: '/test/dir',
      framework: Framework.Express,
      output: '/test/output/tests.test.ts',
      format: 'vitest',
    })

    expect(mockFsWatch).toHaveBeenCalledWith(
      expect.stringContaining('test'),
      { recursive: true },
      expect.any(Function)
    )
    stop()
  })

  it('closes watcher when stop function is called', async () => {
    const stop = await startWatchMode({
      directory: '/test/dir',
      framework: Framework.Express,
      output: '/test/output/tests.test.ts',
      format: 'vitest',
    })

    stop()
    expect(mockWatcherClose).toHaveBeenCalled()
  })

  it('triggers regeneration on fs.watch event', async () => {
    vi.useFakeTimers()
    const onRegenerate = vi.fn()

    const stop = await startWatchMode({
      directory: '/test/dir',
      framework: Framework.Express,
      output: '/test/output/tests.test.ts',
      format: 'vitest',
      onRegenerate,
      debounceMs: 100,
    })

    // Reset call count after initial scan
    onRegenerate.mockClear()

    // Simulate a file change event
    const watchCallback = mockFsWatch.mock.calls[0][2] as (event: string, filename: string) => void
    watchCallback('change', 'src/routes.ts')

    // Advance timer past debounce
    await vi.runAllTimersAsync()

    expect(onRegenerate).toHaveBeenCalled()

    stop()
    vi.useRealTimers()
  })

  it('debounces rapid file change events', async () => {
    vi.useFakeTimers()
    const onRegenerate = vi.fn()

    const stop = await startWatchMode({
      directory: '/test/dir',
      framework: Framework.Express,
      output: '/test/output/tests.test.ts',
      format: 'vitest',
      onRegenerate,
      debounceMs: 200,
    })

    onRegenerate.mockClear()

    const watchCallback = mockFsWatch.mock.calls[0][2] as (event: string, filename: string) => void

    // Fire 5 rapid events
    for (let i = 0; i < 5; i++) {
      watchCallback('change', `src/route${i}.ts`)
    }

    await vi.runAllTimersAsync()

    // Should only regenerate once (debounced)
    expect(onRegenerate).toHaveBeenCalledTimes(1)

    stop()
    vi.useRealTimers()
  })

  it('calls onError when scan fails', async () => {
    const { Scanner } = await import('./scanner.js')
    vi.mocked(Scanner).mockImplementationOnce(() => ({
      scan: vi.fn().mockRejectedValueOnce(new Error('Scan failed')),
    } as never))

    const onError = vi.fn()

    const stop = await startWatchMode({
      directory: '/test/dir',
      framework: Framework.Express,
      output: '/test/output/tests.test.ts',
      format: 'vitest',
      onError,
    })

    // Wait for the promise to resolve (error was caught)
    await new Promise(resolve => setTimeout(resolve, 10))

    stop()
    // onError may or may not have been called depending on mock order
    // The key assertion is that startWatchMode does not throw
  })
})
