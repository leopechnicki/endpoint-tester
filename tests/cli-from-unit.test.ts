import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Unit test for the `from` CLI wiring.
 *
 * We import the CLI as a module, but the `program.parse()` at the bottom of
 * cli.ts runs on module load using `process.argv`. To exercise the `from`
 * subcommand safely we:
 *   - stub `process.argv` before importing,
 *   - mock `importOpenApiDocument` so we can assert it was called with the
 *     right args (and skip real parsing/type overhead),
 *   - mock TestGenerator so no file is actually generated in this unit test,
 *   - assert process exit code + call shape.
 *
 * The full integration flow (real file I/O, real importer) is covered by
 * `cli-from.test.ts` — this file only proves the CLI plumbs argv to the
 * importer correctly.
 */

const UNIT_TMP = join(process.cwd(), '.test-cli-from-unit-tmp');

// Mocks must be declared before any dynamic import of ../src/cli.js.
const importSpy = vi.fn(() => [
  {
    method: 'GET',
    path: '/things',
    handler: 'listThings',
    params: [],
  },
]);

const generateSpy = vi.fn(() => 'GENERATED_TEST_CONTENT');

vi.mock('../src/openapi-import.js', () => ({
  importOpenApiDocument: importSpy,
}));

vi.mock('../src/generator.js', () => ({
  TestGenerator: class {
    generate = generateSpy;
  },
}));

describe('CLI `from` — argv wiring (unit)', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  let exitCode: number | undefined;

  // Track unhandled rejections during the test so we can silently swallow the
  // synthetic __EXIT__ throw our stubbed process.exit uses to short-circuit the
  // action. Any *other* unhandled rejection will still fail the test.
  const unhandled: unknown[] = [];
  const unhandledHandler = (reason: unknown): void => {
    if (reason instanceof Error && /__EXIT__:/.test(reason.message)) return;
    unhandled.push(reason);
  };

  beforeEach(() => {
    mkdirSync(UNIT_TMP, { recursive: true });
    exitCode = undefined;
    unhandled.length = 0;
    process.on('unhandledRejection', unhandledHandler);
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`__EXIT__:${exitCode}`);
    }) as typeof process.exit;
    importSpy.mockClear();
    generateSpy.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.off('unhandledRejection', unhandledHandler);
    try {
      rmSync(UNIT_TMP, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    expect(unhandled).toEqual([]);
  });

  it('parses <spec> arg + --base-path option and forwards them to importOpenApiDocument', async () => {
    const specPath = resolve(UNIT_TMP, 'spec.json');
    writeFileSync(
      specPath,
      JSON.stringify({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {},
      })
    );
    const outDir = resolve(UNIT_TMP, 'out');

    process.argv = [
      'node',
      'cli.js',
      'from',
      specPath,
      '--output',
      outDir,
      '--base-path',
      '/api/v3',
    ];

    // Loading the module runs program.parse(); the .action() callback is async
    // so we spin the event loop until either the importer was called or exit.
    try {
      await import('../src/cli.js');
    } catch {
      /* commander/action may throw via our stubbed process.exit */
    }
    // Give the async action a tick to flush.
    await new Promise((r) => setImmediate(r));

    expect(importSpy).toHaveBeenCalledTimes(1);
    const [docArg, optsArg] = importSpy.mock.calls[0]!;
    expect(docArg).toMatchObject({ openapi: '3.0.0' });
    expect(optsArg).toEqual({ basePath: '/api/v3' });
    // No hard exit expected on the happy path
    expect(exitCode).toBeUndefined();
  });

  it('exits 1 without calling importer when --format is invalid', async () => {
    const specPath = resolve(UNIT_TMP, 'spec.json');
    writeFileSync(specPath, JSON.stringify({ paths: {} }));

    process.argv = ['node', 'cli.js', 'from', specPath, '--format', 'bogus'];

    try {
      await import('../src/cli.js');
    } catch {
      /* stubbed exit throws */
    }
    await new Promise((r) => setImmediate(r));

    expect(exitCode).toBe(1);
    expect(importSpy).not.toHaveBeenCalled();
  });
});
