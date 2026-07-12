import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type {
  Endpoint,
  EndpointParam,
  EndpointBody,
  HttpMethod,
} from './types.js';

/**
 * Parse an OpenAPI 3.x or Swagger 2.x spec file and extract endpoints.
 *
 * Supports both JSON and YAML (simple subset) formats. Converts the spec's
 * paths/operations into the same Endpoint[] format used by framework adapters,
 * so generated tests are identical regardless of whether the endpoints came
 * from source code scanning or an OpenAPI spec.
 */
export function importOpenApiSpec(filePath: string): Endpoint[] {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  let doc: Record<string, unknown>;
  if (ext === '.yaml' || ext === '.yml') {
    doc = parseSimpleYaml(raw);
  } else {
    doc = JSON.parse(raw) as Record<string, unknown>;
  }

  return extractEndpoints(doc);
}

/**
 * Parse an OpenAPI spec from a string (JSON or YAML auto-detected).
 */
export function importOpenApiString(
  content: string,
  format: 'json' | 'yaml' = 'json'
): Endpoint[] {
  const doc =
    format === 'yaml'
      ? parseSimpleYaml(content)
      : (JSON.parse(content) as Record<string, unknown>);
  return extractEndpoints(doc);
}

const HTTP_METHODS: ReadonlySet<string> = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
]);

function extractEndpoints(doc: Record<string, unknown>): Endpoint[] {
  const paths = doc['paths'] as Record<string, Record<string, unknown>> | null;
  if (!paths || typeof paths !== 'object') return [];

  const endpoints: Endpoint[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!operation || typeof operation !== 'object') continue;

      const op = operation as Record<string, unknown>;
      const endpoint = buildEndpoint(
        path,
        method.toUpperCase() as HttpMethod,
        op
      );
      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

function buildEndpoint(
  path: string,
  method: HttpMethod,
  op: Record<string, unknown>
): Endpoint {
  const params = extractParams(op);
  const body = extractBody(op);
  const handler = (op['operationId'] as string) ?? '';

  // Normalize OpenAPI {param} to Express-style :param for consistency
  const normalizedPath = path.replace(/\{(\w+)\}/g, ':$1');

  const endpoint: Endpoint = {
    method,
    path: normalizedPath,
    handler,
    params,
  };

  if (body && Object.keys(body.fields ?? {}).length > 0) {
    endpoint.body = body;
  }

  // Extract response info
  const responses = op['responses'] as Record<
    string,
    Record<string, unknown>
  > | null;
  if (responses) {
    const successCode = findSuccessCode(responses);
    if (successCode) {
      const respObj = responses[successCode];
      const fields = extractResponseFields(respObj);
      if (fields || successCode !== '200') {
        endpoint.response = {
          status: parseInt(successCode, 10),
          ...(fields ? { fields } : {}),
        };
      }
    }
  }

  return endpoint;
}

function extractParams(op: Record<string, unknown>): EndpointParam[] {
  const params: EndpointParam[] = [];
  const rawParams = op['parameters'] as Record<string, unknown>[] | undefined;

  if (!Array.isArray(rawParams)) return params;

  for (const p of rawParams) {
    if (!p || typeof p !== 'object') continue;

    const name = p['name'] as string;
    const location = mapParamLocation(p['in'] as string);
    if (!name || !location) continue;

    const schema = p['schema'] as Record<string, unknown> | undefined;
    const type = schema ? mapSchemaType(schema) : undefined;

    params.push({
      name,
      location,
      type,
      required: (p['required'] as boolean) ?? location === 'path',
    });
  }

  return params;
}

function mapParamLocation(
  loc: string
): 'path' | 'query' | 'header' | undefined {
  switch (loc) {
    case 'path':
      return 'path';
    case 'query':
      return 'query';
    case 'header':
      return 'header';
    default:
      return undefined;
  }
}

function extractBody(op: Record<string, unknown>): EndpointBody | undefined {
  const requestBody = op['requestBody'] as Record<string, unknown> | undefined;
  if (!requestBody) return undefined;

  const content = requestBody['content'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!content) return undefined;

  const jsonContent = content['application/json'];
  if (!jsonContent) return undefined;

  const schema = jsonContent['schema'] as Record<string, unknown> | undefined;
  if (!schema) return undefined;

  const fields = extractSchemaFields(schema);
  if (!fields || Object.keys(fields).length === 0) return undefined;

  return { type: 'object', fields };
}

function extractSchemaFields(
  schema: Record<string, unknown>
): Record<string, string> | undefined {
  const properties = schema['properties'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!properties) return undefined;

  const fields: Record<string, string> = {};
  for (const [name, prop] of Object.entries(properties)) {
    fields[name] = mapSchemaType(prop);
  }
  return fields;
}

function mapSchemaType(schema: Record<string, unknown>): string {
  const type = schema['type'] as string | undefined;
  switch (type) {
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

function findSuccessCode(
  responses: Record<string, unknown>
): string | undefined {
  // Prefer explicit 2xx codes in order
  for (const code of ['200', '201', '202', '204']) {
    if (responses[code]) return code;
  }
  // Fall back to any 2xx
  for (const code of Object.keys(responses)) {
    if (code.startsWith('2')) return code;
  }
  return undefined;
}

function extractResponseFields(
  respObj: Record<string, unknown>
): Record<string, string> | undefined {
  const content = respObj['content'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!content) return undefined;

  const jsonContent = content['application/json'];
  if (!jsonContent) return undefined;

  const schema = jsonContent['schema'] as Record<string, unknown> | undefined;
  if (!schema) return undefined;

  return extractSchemaFields(schema);
}

// ---------------------------------------------------------------------------
// Minimal YAML parser (subset: handles the shapes found in OpenAPI specs)
// ---------------------------------------------------------------------------

/**
 * Parse a simple YAML document into a JS object.
 *
 * This is NOT a full YAML parser. It handles:
 * - Key-value pairs (scalars: strings, numbers, booleans, null)
 * - Nested objects (indentation-based)
 * - Sequences (- item)
 * - Quoted strings (single and double)
 *
 * It does NOT handle:
 * - Anchors/aliases, multi-line scalars, flow sequences, tags, etc.
 *
 * For production use with arbitrary YAML, use the `yaml` package.
 * This parser is intentionally zero-dependency to keep the tool lightweight.
 */
export function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  return parseYamlLines(lines, 0, 0).value as Record<string, unknown>;
}

interface ParseResult {
  value: unknown;
  nextLine: number;
}

function parseYamlLines(
  lines: string[],
  startLine: number,
  baseIndent: number
): ParseResult {
  const obj: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent < baseIndent) break; // Dedented — parent scope resumes

    const trimmed = line.trimStart();

    // Sequence item at this level
    if (trimmed.startsWith('- ') || trimmed === '-') {
      // This is an array, not an object
      return parseYamlArray(lines, i, indent);
    }

    // Key-value pair
    const colonIdx = findUnquotedColon(trimmed);
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = unquoteYaml(trimmed.substring(0, colonIdx).trim());
    const valueStr = trimmed.substring(colonIdx + 1).trim();

    if (valueStr === '' || valueStr === '|' || valueStr === '>') {
      // Nested object or block scalar — look at the next non-empty line
      const nextLine = findNextContentLine(lines, i + 1);
      if (nextLine < lines.length) {
        const nextIndent =
          lines[nextLine].length - lines[nextLine].trimStart().length;
        if (nextIndent > indent) {
          const child = parseYamlLines(lines, nextLine, nextIndent);
          obj[key] = child.value;
          i = child.nextLine;
          continue;
        }
      }
      obj[key] = null;
      i++;
    } else if (valueStr === '[]') {
      obj[key] = [];
      i++;
    } else if (valueStr === '{}') {
      obj[key] = {};
      i++;
    } else {
      obj[key] = parseYamlScalar(valueStr);
      i++;
    }
  }

  return { value: obj, nextLine: i };
}

function parseYamlArray(
  lines: string[],
  startLine: number,
  baseIndent: number
): ParseResult {
  const arr: unknown[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      i++;
      continue;
    }

    const trimmed = line.trimStart();
    if (!trimmed.startsWith('-')) break;

    const itemContent = trimmed.substring(1).trim();

    if (itemContent === '' || itemContent === '') {
      // Block item — parse nested content
      const nextLine = findNextContentLine(lines, i + 1);
      if (nextLine < lines.length) {
        const nextIndent =
          lines[nextLine].length - lines[nextLine].trimStart().length;
        if (nextIndent > indent) {
          const child = parseYamlLines(lines, nextLine, nextIndent);
          arr.push(child.value);
          i = child.nextLine;
          continue;
        }
      }
      arr.push(null);
      i++;
    } else {
      // Check if inline content has a colon (inline object start)
      const colonIdx = findUnquotedColon(itemContent);
      if (colonIdx > 0) {
        // Inline key:value — treat as single-key object, but also check for
        // continuation lines at deeper indent
        const key = unquoteYaml(itemContent.substring(0, colonIdx).trim());
        const val = itemContent.substring(colonIdx + 1).trim();

        // Check if there are more keys at the same nested indent
        const itemIndent = indent + 2; // standard YAML sequence item indent
        const nextLine = findNextContentLine(lines, i + 1);
        if (
          nextLine < lines.length &&
          lines[nextLine].length - lines[nextLine].trimStart().length >=
            itemIndent
        ) {
          // Multi-key object: parse the first key inline, then continue
          const childObj: Record<string, unknown> = {};
          if (val === '') {
            const deepNext = findNextContentLine(lines, i + 1);
            if (deepNext < lines.length) {
              const deepIndent =
                lines[deepNext].length - lines[deepNext].trimStart().length;
              if (deepIndent > indent) {
                const child = parseYamlLines(lines, deepNext, deepIndent);
                childObj[key] = child.value;
                // Continue parsing remaining keys
                const remaining = parseYamlLines(
                  lines,
                  child.nextLine,
                  itemIndent
                );
                Object.assign(
                  childObj,
                  remaining.value as Record<string, unknown>
                );
                arr.push(childObj);
                i = remaining.nextLine;
                continue;
              }
            }
            childObj[key] = null;
          } else {
            childObj[key] = parseYamlScalar(val);
          }

          // Parse remaining sibling keys at the item indent
          const remaining = parseYamlLines(lines, i + 1, itemIndent);
          Object.assign(childObj, remaining.value as Record<string, unknown>);
          arr.push(childObj);
          i = remaining.nextLine;
        } else {
          // Single inline key-value
          const itemObj: Record<string, unknown> = {};
          itemObj[key] = val === '' ? null : parseYamlScalar(val);
          arr.push(itemObj);
          i++;
        }
      } else {
        arr.push(parseYamlScalar(itemContent));
        i++;
      }
    }
  }

  return { value: arr, nextLine: i };
}

function findNextContentLine(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed !== '' && !trimmed.startsWith('#')) return i;
  }
  return lines.length;
}

function findUnquotedColon(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ':' && !inSingle && !inDouble) {
      // Colon must be followed by space or end-of-string to be a YAML separator
      if (i + 1 >= s.length || s[i + 1] === ' ') return i;
    }
  }
  return -1;
}

function unquoteYaml(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYamlScalar(s: string): unknown {
  // Remove inline comments
  const commentIdx = s.indexOf(' #');
  const clean = commentIdx >= 0 ? s.substring(0, commentIdx).trim() : s;

  // Unquote
  const unquoted = unquoteYaml(clean);
  if (unquoted !== clean) return unquoted;

  // Boolean
  if (clean === 'true' || clean === 'True' || clean === 'TRUE') return true;
  if (clean === 'false' || clean === 'False' || clean === 'FALSE') return false;

  // Null
  if (clean === 'null' || clean === 'Null' || clean === 'NULL' || clean === '~')
    return null;

  // Number
  if (/^-?\d+$/.test(clean)) return parseInt(clean, 10);
  if (/^-?\d+\.\d+$/.test(clean)) return parseFloat(clean);

  return clean;
}
