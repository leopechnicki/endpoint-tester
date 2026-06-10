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
