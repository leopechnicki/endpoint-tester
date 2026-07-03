import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { Framework } from '../src/types.js';

const TEST_DIR = join(process.cwd(), '.test-config-tmp');

function setup(files: Record<string, string>) {
  mkdirSync(TEST_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(TEST_DIR, name), content);
  }
}

describe('loadConfig', () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('returns null when no config file exists', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const result = loadConfig(TEST_DIR);
    expect(result).toBeNull();
  });

  it('reads .endpointtesterrc (JSON without extension)', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ framework: 'express' }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result?.framework).toBe(Framework.Express);
  });

  it('reads .endpointtesterrc.json', () => {
    setup({
      '.endpointtesterrc.json': JSON.stringify({ framework: 'fastapi' }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.framework).toBe(Framework.FastAPI);
  });

  it('prefers .endpointtesterrc over .endpointtesterrc.json when both exist', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ framework: 'express' }),
      '.endpointtesterrc.json': JSON.stringify({ framework: 'fastapi' }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.framework).toBe(Framework.Express);
  });

  it('reads outputDir', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ outputDir: './my-tests' }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.outputDir).toBe('./my-tests');
  });

  it('reads testRunner', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ testRunner: 'jest' }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.testRunner).toBe('jest');
  });

  it('reads exclude patterns', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({
        exclude: ['legacy/**', 'test/**'],
      }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.exclude).toEqual(['legacy/**', 'test/**']);
  });

  it('reads include patterns', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ include: ['src/**'] }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.include).toEqual(['src/**']);
  });

  it('reads baseUrl', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ baseUrl: 'http://localhost:8080' }),
    });
    const result = loadConfig(TEST_DIR);
    expect(result?.baseUrl).toBe('http://localhost:8080');
  });

  it('reads all fields together', () => {
    const cfg = {
      framework: 'nestjs',
      outputDir: './generated',
      testRunner: 'vitest',
      include: ['src/**'],
      exclude: ['dist/**'],
      baseUrl: 'http://api.example.com',
    };
    setup({ '.endpointtesterrc': JSON.stringify(cfg) });
    const result = loadConfig(TEST_DIR);
    expect(result?.framework).toBe('nestjs');
    expect(result?.outputDir).toBe('./generated');
    expect(result?.testRunner).toBe('vitest');
    expect(result?.include).toEqual(['src/**']);
    expect(result?.exclude).toEqual(['dist/**']);
    expect(result?.baseUrl).toBe('http://api.example.com');
  });

  it('ignores unknown fields without throwing', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({
        framework: 'express',
        unknownFutureField: true,
      }),
    });
    expect(() => loadConfig(TEST_DIR)).not.toThrow();
    const result = loadConfig(TEST_DIR);
    expect(result?.framework).toBe(Framework.Express);
  });

  it('throws on invalid JSON', () => {
    setup({
      '.endpointtesterrc': '{ not valid json }',
    });
    expect(() => loadConfig(TEST_DIR)).toThrow(/not valid JSON/);
  });

  it('throws when root value is not an object', () => {
    setup({
      '.endpointtesterrc': JSON.stringify([1, 2, 3]),
    });
    expect(() => loadConfig(TEST_DIR)).toThrow(/must be a JSON object/);
  });

  it('throws when framework is not a string', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ framework: 42 }),
    });
    expect(() => loadConfig(TEST_DIR)).toThrow(/"framework" must be a string/);
  });

  it('throws when exclude is not an array of strings', () => {
    setup({
      '.endpointtesterrc': JSON.stringify({ exclude: 'not-an-array' }),
    });
    expect(() => loadConfig(TEST_DIR)).toThrow(
      /"exclude" must be an array of strings/
    );
  });
});

// Regression coverage for CONSOLIDATED#5 (2026-07-02 audit): a valid
// `.endpointtesterrc` at the project root was ignored when the user ran
// `endpoint-tester generate ./src` because the loader only ever searched
// the scan directory. The fix walks (scanDir -> cwd -> parents) so a rc
// file at the project root wins even when scanning a subdirectory.
describe('loadConfig — search-path behavior (CONSOLIDATED#5 regression)', () => {
  const originalCwd = process.cwd();
  const ROOT = join(originalCwd, '.test-config-search-root');
  const SUB = join(ROOT, 'src');

  beforeEach(() => {
    mkdirSync(SUB, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      rmSync(ROOT, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('finds a rc file placed in the parent of the scanned directory', () => {
    writeFileSync(
      join(ROOT, '.endpointtesterrc'),
      JSON.stringify({ framework: 'flask', baseUrl: 'http://parent:9000' })
    );

    const result = loadConfig(SUB);
    expect(result).not.toBeNull();
    expect(result?.framework).toBe('flask');
    expect(result?.baseUrl).toBe('http://parent:9000');
  });

  it('finds a rc file in the CWD even when scanning an unrelated directory', () => {
    // Simulate: user cd'd into project root, config lives at project root,
    // then ran `endpoint-tester generate /tmp/something-else`.
    writeFileSync(
      join(ROOT, '.endpointtesterrc'),
      JSON.stringify({ testRunner: 'pytest' })
    );

    // Isolated dir that is NOT a parent of ROOT (so parent-walk can't find it)
    const ISOLATED = join(originalCwd, '.test-config-isolated');
    mkdirSync(ISOLATED, { recursive: true });
    try {
      process.chdir(ROOT);
      const result = loadConfig(ISOLATED);
      expect(result?.testRunner).toBe('pytest');
    } finally {
      try {
        rmSync(ISOLATED, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('prefers a rc file in the scanned directory over one in CWD', () => {
    // scanDir wins over cwd — most-specific location has precedence.
    writeFileSync(
      join(ROOT, '.endpointtesterrc'),
      JSON.stringify({ framework: 'express' })
    );
    writeFileSync(
      join(SUB, '.endpointtesterrc'),
      JSON.stringify({ framework: 'fastapi' })
    );

    process.chdir(ROOT);
    const result = loadConfig(SUB);
    expect(result?.framework).toBe('fastapi');
  });

  it('returns null when no rc file exists anywhere on the search path', () => {
    // No config planted in ROOT, SUB, or cwd — should walk to root and give up.
    process.chdir(SUB);
    const result = loadConfig(SUB);
    expect(result).toBeNull();
  });
});
