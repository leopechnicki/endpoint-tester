import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '../dist/cli.js');
const TEST_DIR = join(process.cwd(), '.test-cli-from-tmp');

function runCli(args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    return {
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? '',
      exitCode: execErr.status ?? 1,
    };
  }
}

const MINIMAL_OPENAPI3 = {
  openapi: '3.0.3',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        responses: { '200': { description: 'OK' } },
      },
      post: {
        operationId: 'createUser',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

function setupSpec(name: string, content: string): string {
  mkdirSync(TEST_DIR, { recursive: true });
  const specPath = join(TEST_DIR, name);
  writeFileSync(specPath, content);
  return specPath;
}

describe('CLI `from` command', () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('exposes `from` in the top-level help output', () => {
    const { stdout, exitCode } = runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('from');
  });

  it('shows `from` help with a spec argument description', () => {
    const { stdout, exitCode } = runCli(['from', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('spec');
    expect(stdout).toContain('--format');
    expect(stdout).toContain('--output');
    expect(stdout).toContain('--base-url');
  });

  it('generates a vitest test file from a JSON OpenAPI spec', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify(MINIMAL_OPENAPI3)
    );
    const outputDir = join(TEST_DIR, 'out');

    const { stdout, stderr, exitCode } = runCli([
      'from',
      specPath,
      '--output',
      outputDir,
      '--format',
      'vitest',
    ]);

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain('Imported 3 endpoint(s)');
    expect(stdout).toContain('Tests written to');

    const outFile = join(outputDir, 'endpoints.test.ts');
    expect(existsSync(outFile)).toBe(true);
    const content = readFileSync(outFile, 'utf-8');
    expect(content).toContain('/users');
    expect(content).toContain('/users/');
  });

  it('generates a vitest test file from a YAML OpenAPI spec', () => {
    const yamlSpec = [
      'openapi: 3.0.3',
      'info:',
      '  title: Test',
      '  version: 1.0.0',
      'paths:',
      '  /users:',
      '    get:',
      '      operationId: listUsers',
      '      responses:',
      "        '200':",
      '          description: OK',
    ].join('\n');
    const specPath = setupSpec('openapi.yaml', yamlSpec);
    const outputDir = join(TEST_DIR, 'out');

    const { stdout, stderr, exitCode } = runCli([
      'from',
      specPath,
      '--output',
      outputDir,
    ]);

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain('Imported 1 endpoint(s)');

    const outFile = join(outputDir, 'endpoints.test.ts');
    expect(existsSync(outFile)).toBe(true);
  });

  it('re-emits an OpenAPI spec when --format openapi is used', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify(MINIMAL_OPENAPI3)
    );
    const outputDir = join(TEST_DIR, 'out');

    const { stdout, stderr, exitCode } = runCli([
      'from',
      specPath,
      '--output',
      outputDir,
      '--format',
      'openapi',
    ]);

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain('OpenAPI spec written to');

    const outFile = join(outputDir, 'openapi.json');
    expect(existsSync(outFile)).toBe(true);
  });

  it('emits a Postman collection when --format postman is used', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify(MINIMAL_OPENAPI3)
    );
    const outputDir = join(TEST_DIR, 'out');

    const { stdout, stderr, exitCode } = runCli([
      'from',
      specPath,
      '--output',
      outputDir,
      '--format',
      'postman',
    ]);

    expect(exitCode, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain('Postman collection written to');

    const outFile = join(outputDir, 'postman-collection.json');
    expect(existsSync(outFile)).toBe(true);
  });

  it('exits 1 when the spec file does not exist', () => {
    const { stderr, exitCode } = runCli([
      'from',
      join(TEST_DIR, 'does-not-exist.yaml'),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('exits 1 on an invalid --format value', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify(MINIMAL_OPENAPI3)
    );
    const { stderr, exitCode } = runCli([
      'from',
      specPath,
      '--format',
      'not-a-real-format',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Invalid --format');
  });

  it('exits 1 on an invalid --base-url value', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify(MINIMAL_OPENAPI3)
    );
    const { stderr, exitCode } = runCli([
      'from',
      specPath,
      '--base-url',
      'not a url',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Invalid --base-url');
  });

  it('exits 1 on a malformed spec (missing paths)', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify({ openapi: '3.0.0', info: { title: 'X', version: '1' } })
    );

    const { stderr, exitCode } = runCli(['from', specPath]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Invalid OpenAPI spec');
  });

  it('applies --base-path override to all imported endpoints', () => {
    const specPath = setupSpec(
      'openapi.json',
      JSON.stringify(MINIMAL_OPENAPI3)
    );
    const outputDir = join(TEST_DIR, 'out');

    const { stdout, stderr, exitCode } = runCli([
      'from',
      specPath,
      '--output',
      outputDir,
      '--base-path',
      '/api/v2',
      '--format',
      'openapi',
    ]);

    expect(exitCode, `stderr: ${stderr}`).toBe(0);

    const outFile = join(outputDir, 'openapi.json');
    const content = JSON.parse(readFileSync(outFile, 'utf-8')) as {
      paths: Record<string, unknown>;
    };
    const paths = Object.keys(content.paths);
    // Every emitted path should start with the override base path
    expect(paths.every((p) => p.startsWith('/api/v2'))).toBe(true);
  });
});
