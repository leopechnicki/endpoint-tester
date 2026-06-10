import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Framework, SupportedFormat } from './types.js';

/**
 * Shape of the .endpointtesterrc config file.
 *
 * All fields are optional — the file can set any subset of options.
 * CLI flags always take precedence over config file values.
 */
export interface EndpointTesterConfig {
  /** Override auto-detection: specify the framework explicitly. */
  framework?: Framework;
  /** Default output directory for generated tests. */
  outputDir?: string;
  /** Default test runner format (vitest, jest, pytest, go, openapi). */
  testRunner?: SupportedFormat;
  /** Glob patterns to include (scanned in addition to framework-default extensions). */
  include?: string[];
  /** Glob patterns to exclude from scanning. */
  exclude?: string[];
  /** Default base URL used in generated tests. */
  baseUrl?: string;
}

/**
 * Candidate config file names, tried in order.
 * The first one that exists wins.
 */
const CONFIG_FILE_NAMES = [
  '.endpointtesterrc',
  '.endpointtesterrc.json',
] as const;

/**
 * Load the nearest config file from the given directory (or the current working
 * directory if not specified).
 *
 * Returns `null` if no config file is found.
 * Throws a descriptive error if a file exists but is not valid JSON or does not
 * conform to the expected shape.
 */
export function loadConfig(directory?: string): EndpointTesterConfig | null {
  const searchDir = directory ? resolve(directory) : process.cwd();

  for (const name of CONFIG_FILE_NAMES) {
    const filePath = join(searchDir, name);
    if (!existsSync(filePath)) continue;

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `endpoint-tester: could not read config file ${filePath}: ${(err as Error).message}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `endpoint-tester: config file ${filePath} is not valid JSON: ${(err as Error).message}`
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        `endpoint-tester: config file ${filePath} must be a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`
      );
    }

    const config = parsed as Record<string, unknown>;
    return validateConfig(config, filePath);
  }

  return null;
}

/**
 * Validate the parsed config object and coerce it into EndpointTesterConfig.
 * Unknown fields are silently ignored for forward-compatibility.
 */
function validateConfig(
  raw: Record<string, unknown>,
  filePath: string
): EndpointTesterConfig {
  const result: EndpointTesterConfig = {};

  if ('framework' in raw) {
    if (typeof raw['framework'] !== 'string') {
      throw new Error(
        `endpoint-tester: ${filePath}: "framework" must be a string`
      );
    }
    result.framework = raw['framework'] as Framework;
  }

  if ('outputDir' in raw) {
    if (typeof raw['outputDir'] !== 'string') {
      throw new Error(
        `endpoint-tester: ${filePath}: "outputDir" must be a string`
      );
    }
    result.outputDir = raw['outputDir'];
  }

  if ('testRunner' in raw) {
    if (typeof raw['testRunner'] !== 'string') {
      throw new Error(
        `endpoint-tester: ${filePath}: "testRunner" must be a string`
      );
    }
    result.testRunner = raw['testRunner'] as SupportedFormat;
  }

  if ('include' in raw) {
    if (
      !Array.isArray(raw['include']) ||
      !raw['include'].every((v) => typeof v === 'string')
    ) {
      throw new Error(
        `endpoint-tester: ${filePath}: "include" must be an array of strings`
      );
    }
    result.include = raw['include'] as string[];
  }

  if ('exclude' in raw) {
    if (
      !Array.isArray(raw['exclude']) ||
      !raw['exclude'].every((v) => typeof v === 'string')
    ) {
      throw new Error(
        `endpoint-tester: ${filePath}: "exclude" must be an array of strings`
      );
    }
    result.exclude = raw['exclude'] as string[];
  }

  if ('baseUrl' in raw) {
    if (typeof raw['baseUrl'] !== 'string') {
      throw new Error(
        `endpoint-tester: ${filePath}: "baseUrl" must be a string`
      );
    }
    result.baseUrl = raw['baseUrl'];
  }

  return result;
}
