import type { Endpoint, HttpMethod } from './types.js';

/**
 * A single entry in a diff result: HTTP method + canonical path.
 * Canonical path uses OpenAPI-style `{name}` placeholders regardless of source format.
 */
export interface DiffEntry {
  method: HttpMethod;
  path: string;
}

/**
 * The result of diffing discovered endpoints against an OpenAPI spec.
 * `hasDrift` is true when either direction shows missing endpoints.
 */
export interface DiffResult {
  hasDrift: boolean;
  matched: DiffEntry[];
  missingInSource: DiffEntry[];
  missingInSpec: DiffEntry[];
}

const HTTP_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

/**
 * Parse an OpenAPI 3.x document and extract the (method, path) pairs it declares.
 *
 * Accepts JavaScript objects — YAML input should be parsed via `js-yaml` or an
 * equivalent tool by the caller. JSON input can be passed straight through
 * `JSON.parse`.
 */
export function parseOpenApiEndpoints(spec: unknown): DiffEntry[] {
  if (!spec || typeof spec !== 'object') {
    throw new Error(
      'Invalid OpenAPI spec: expected an object at the top level.'
    );
  }
  const paths = (spec as { paths?: unknown }).paths;
  if (!paths || typeof paths !== 'object') {
    throw new Error('Invalid OpenAPI spec: missing or non-object "paths".');
  }

  const endpoints: DiffEntry[] = [];
  for (const [rawPath, pathItem] of Object.entries(
    paths as Record<string, unknown>
  )) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [key, value] of Object.entries(
      pathItem as Record<string, unknown>
    )) {
      const method = key.toUpperCase() as HttpMethod;
      if (!HTTP_METHODS.has(method)) continue;
      if (!value || typeof value !== 'object') continue;
      endpoints.push({ method, path: canonicalPath(rawPath) });
    }
  }
  return endpoints;
}

/**
 * Diff the endpoints your scanner discovered against those declared in the OpenAPI spec.
 *
 * Both sides are compared on a canonical `(METHOD, path)` identity. Paths from either
 * source are normalised so `:id`, `{id}`, and `<int:id>` all collapse to the same key.
 */
export function diffOpenApi(discovered: Endpoint[], spec: unknown): DiffResult {
  const specEntries = parseOpenApiEndpoints(spec);
  const discoveredEntries: DiffEntry[] = discovered.map((ep) => ({
    method: ep.method,
    path: canonicalPath(ep.path),
  }));

  const specKeys = new Set(specEntries.map(entryKey));
  const discoveredKeys = new Set(discoveredEntries.map(entryKey));

  const matched: DiffEntry[] = [];
  const missingInSource: DiffEntry[] = [];
  const missingInSpec: DiffEntry[] = [];

  for (const entry of specEntries) {
    if (discoveredKeys.has(entryKey(entry))) {
      matched.push(entry);
    } else {
      missingInSource.push(entry);
    }
  }
  for (const entry of discoveredEntries) {
    if (!specKeys.has(entryKey(entry))) {
      missingInSpec.push(entry);
    }
  }

  return {
    hasDrift: missingInSource.length > 0 || missingInSpec.length > 0,
    matched,
    missingInSource,
    missingInSpec,
  };
}

/**
 * Format a `DiffResult` as a human-friendly CLI report.
 * Green tick when in sync; grouped bullet lists when drift is present.
 */
export function formatDiff(result: DiffResult): string {
  if (!result.hasDrift) {
    return `Source code and OpenAPI spec are in sync (${result.matched.length} endpoint${result.matched.length === 1 ? '' : 's'} matched).`;
  }

  const lines: string[] = [];
  lines.push(
    `Drift detected between OpenAPI spec and source code (${result.matched.length} matched).`
  );

  if (result.missingInSource.length > 0) {
    lines.push('');
    lines.push(
      `In spec, but not in source (${result.missingInSource.length}):`
    );
    for (const entry of result.missingInSource) {
      lines.push(`  - ${entry.method} ${entry.path}`);
    }
  }

  if (result.missingInSpec.length > 0) {
    lines.push('');
    lines.push(`In source, but not in spec (${result.missingInSpec.length}):`);
    for (const entry of result.missingInSpec) {
      lines.push(`  + ${entry.method} ${entry.path}`);
    }
  }

  return lines.join('\n');
}

// --- helpers -----------------------------------------------------------------

function entryKey(entry: DiffEntry): string {
  return `${entry.method}:${entry.path}`;
}

/**
 * Canonicalise a path so identical routes in different frameworks compare equal.
 * All placeholder styles collapse to OpenAPI-style `{name}`.
 */
function canonicalPath(path: string): string {
  return path
    .replace(/<(?:[^:>]+:)?([A-Za-z0-9_]+)>/g, '{$1}') // Flask/Django  <int:id> | <id>
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}'); // Express/NestJS  :id
}
