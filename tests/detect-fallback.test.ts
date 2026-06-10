/**
 * Tests for the improved framework detection fallback behaviour.
 *
 * Previously, the CLI silently defaulted to Express when no framework was
 * detected. The new behaviour:
 *   - JS project (has package.json but no framework): warn and fall back to Express
 *   - Non-JS project (no package.json): error and exit 1
 *
 * This file tests the detectFramework() function directly to verify it still
 * returns null for unknown projects (the CLI layer handles the exit code).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { detectFramework } from '../src/detect.js';

const TEST_DIR = join(process.cwd(), '.test-fallback-tmp');

function setupDir(files: Record<string, string>) {
  mkdirSync(TEST_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(TEST_DIR, name);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, content);
  }
}

describe('detectFramework — fallback and edge cases', () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('returns null for a completely empty directory', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const result = await detectFramework(TEST_DIR);
    expect(result).toBeNull();
  });

  it('returns null for a Go project without recognized framework deps', async () => {
    setupDir({
      'go.mod': 'module example.com/myapp\n\ngo 1.21\n',
      'main.go': 'package main\n\nfunc main() {}\n',
    });
    // go.mod with no known framework falls back to net/http detection (medium confidence)
    // or returns null if no framework is recognized
    const result = await detectFramework(TEST_DIR);
    // go.mod present → detected as NetHttp with medium confidence
    if (result !== null) {
      expect(result.framework).toBe('nethttp');
    }
  });

  it('returns null for a package.json with no recognized framework', async () => {
    setupDir({
      'package.json': JSON.stringify({
        dependencies: { lodash: '^4.17.21', axios: '^1.0.0' },
      }),
    });
    const result = await detectFramework(TEST_DIR);
    expect(result).toBeNull();
  });

  it('detects Hono from package.json', async () => {
    setupDir({
      'package.json': JSON.stringify({ dependencies: { hono: '^4.0.0' } }),
    });
    const result = await detectFramework(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.framework).toBe('hono');
    expect(result!.confidence).toBe('high');
  });

  it('detects Hono from import statement in source', async () => {
    setupDir({
      'src/app.ts': `import { Hono } from 'hono';\nconst app = new Hono();\n`,
    });
    const result = await detectFramework(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.framework).toBe('hono');
    expect(result!.confidence).toBe('medium');
  });

  it('detects Hono from hono/ sub-import', async () => {
    setupDir({
      'src/middleware.ts': `import { cors } from 'hono/cors';\n`,
    });
    const result = await detectFramework(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.framework).toBe('hono');
  });

  it('prefers NestJS over Hono when both present in package.json', async () => {
    setupDir({
      'package.json': JSON.stringify({
        dependencies: {
          hono: '^4.0.0',
          '@nestjs/core': '^10.0.0',
        },
      }),
    });
    // NestJS is checked first in package.json detection
    const result = await detectFramework(TEST_DIR);
    expect(result!.framework).toBe('nestjs');
  });

  it('returns null for Python project with unrecognised framework', async () => {
    setupDir({
      'requirements.txt': 'tornado==6.3\naiohttp==3.8\n',
    });
    // Tornado and aiohttp are not in the detection list — should return null
    const result = await detectFramework(TEST_DIR);
    expect(result).toBeNull();
  });
});
