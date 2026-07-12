import type {
  Endpoint,
  EndpointParam,
  EndpointBody,
  HttpMethod,
} from './types.js';

/**
 * Options for importing endpoints from an OpenAPI/Swagger spec.
 */
export interface ImportOptions {
  /**
   * Override the base path for all endpoints. When set, this is prepended
   * to every path from the spec. For Swagger 2.0 docs the basePath from
   * the spec is used automatically unless this override is provided.
   */
  basePath?: string;
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

/**
 * Import endpoints from an OpenAPI 3.x or Swagger 2.0 document (as a parsed
 * JavaScript object). Returns fully-populated `Endpoint[]` with params, body,
 * response, and handler extracted from the spec.
 *
 * This module is zero-dependency -- it does not ship a YAML parser. Callers
 * that need YAML support should parse the YAML to a plain object first and
 * pass it here.
 */
export function importOpenApiDocument(
  doc: Record<string, unknown>,
  options?: ImportOptions
): Endpoint[] {
  if (!doc || typeof doc !== 'object') {
    throw new Error(
      'Invalid OpenAPI spec: expected an object at the top level.'
    );
  }

  const isSwagger2 =
    typeof doc['swagger'] === 'string' &&
    (doc['swagger'] as string).startsWith('2');

  // Determine the base path: explicit option > Swagger 2 basePath > empty
  let basePath =
    options?.basePath ??
    (isSwagger2 ? ((doc['basePath'] as string) ?? '') : '');

  // Normalize: remove trailing slash to avoid double-slash
  if (basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }

  const paths = doc['paths'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!paths || typeof paths !== 'object') {
    throw new Error('Invalid OpenAPI spec: missing or non-object "paths".');
  }

  const endpoints: Endpoint[] = [];

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [method, operationValue] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!operationValue || typeof operationValue !== 'object') continue;

      const operation = operationValue as Record<string, unknown>;
      const fullPath = basePath + pathKey;

      const params = extractParams(operation, pathItem, isSwagger2);
      const body = extractBody(operation, isSwagger2);
      const response = extractResponse(operation, isSwagger2);
      const handler = (operation['operationId'] as string) ?? '';

      endpoints.push({
        method: method.toUpperCase() as HttpMethod,
        path: fullPath,
        handler,
        params,
        body: body ?? undefined,
        response: response ?? undefined,
      });
    }
  }

  return endpoints;
}

// --- parameter extraction ----------------------------------------------------

function extractParams(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  isSwagger2: boolean
): EndpointParam[] {
  const pathParams = asArray(pathItem['parameters']);
  const opParams = asArray(operation['parameters']);

  // Operation-level params override path-level params with the same name+in
  const merged = new Map<string, Record<string, unknown>>();
  for (const p of pathParams) {
    if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      merged.set(`${obj['name']}:${obj['in']}`, obj);
    }
  }
  for (const p of opParams) {
    if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      merged.set(`${obj['name']}:${obj['in']}`, obj);
    }
  }

  const result: EndpointParam[] = [];
  for (const param of merged.values()) {
    const location = mapParamLocation(param['in'] as string);
    if (!location) continue;

    // In Swagger 2 the type lives directly on the parameter; in OAS 3 it's under schema.
    const schema = (param['schema'] as Record<string, unknown>) ?? {};
    result.push({
      name: param['name'] as string,
      location,
      type: schemaToType(schema, isSwagger2 ? param : undefined),
      required: location === 'path' ? true : Boolean(param['required']),
    });
  }

  return result;
}

function mapParamLocation(loc: string): 'path' | 'query' | 'header' | null {
  switch (loc) {
    case 'path':
      return 'path';
    case 'query':
      return 'query';
    case 'header':
      return 'header';
    default:
      return null; // skip cookie, body (handled separately)
  }
}

// --- body extraction ---------------------------------------------------------

function extractBody(
  operation: Record<string, unknown>,
  isSwagger2: boolean
): EndpointBody | null {
  if (isSwagger2) {
    return extractBodySwagger2(operation);
  }
  return extractBodyOpenApi3(operation);
}

function extractBodyOpenApi3(
  operation: Record<string, unknown>
): EndpointBody | null {
  const requestBody = operation['requestBody'] as
    | Record<string, unknown>
    | undefined;
  if (!requestBody) return null;

  const content = requestBody['content'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!content) return null;

  const jsonContent = content['application/json'] ?? content['*/*'];
  if (!jsonContent) return null;

  const schema = jsonContent['schema'] as Record<string, unknown> | undefined;
  if (!schema) return null;

  return schemaToBody(schema);
}

function extractBodySwagger2(
  operation: Record<string, unknown>
): EndpointBody | null {
  const params = asArray(operation['parameters']);
  for (const p of params) {
    if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      if (obj['in'] === 'body') {
        const schema = obj['schema'] as Record<string, unknown> | undefined;
        if (schema) return schemaToBody(schema);
      }
    }
  }
  return null;
}

function schemaToBody(schema: Record<string, unknown>): EndpointBody {
  const fields: Record<string, string> = {};
  const properties = schema['properties'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (properties) {
    for (const [name, prop] of Object.entries(properties)) {
      fields[name] = schemaTypeToString(prop);
    }
  }
  return {
    type: schema['type'] as string | undefined,
    fields: Object.keys(fields).length > 0 ? fields : undefined,
  };
}

// --- response extraction -----------------------------------------------------

function extractResponse(
  operation: Record<string, unknown>,
  isSwagger2: boolean
): {
  status?: number;
  type?: string;
  fields?: Record<string, string>;
  isArray?: boolean;
} | null {
  const responses = operation['responses'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!responses) return null;

  // Pick the first 2xx response; fallback to the first key
  const successKey =
    Object.keys(responses).find((k) => k.startsWith('2')) ??
    Object.keys(responses)[0];
  if (!successKey) return null;

  const status = /^\d+$/.test(successKey)
    ? parseInt(successKey, 10)
    : undefined;
  const response = responses[successKey];
  if (!response) return { status };

  let schema: Record<string, unknown> | undefined;

  if (isSwagger2) {
    schema = response['schema'] as Record<string, unknown> | undefined;
  } else {
    const content = response['content'] as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (content) {
      const jsonContent =
        content['application/json'] ?? Object.values(content)[0];
      if (jsonContent) {
        schema = jsonContent['schema'] as Record<string, unknown> | undefined;
      }
    }
  }

  if (!schema) return { status };

  const isArray = schema['type'] === 'array';
  const itemsSchema = isArray
    ? (schema['items'] as Record<string, unknown> | undefined)
    : schema;

  const fields: Record<string, string> = {};
  const properties = itemsSchema?.['properties'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (properties) {
    for (const [name, prop] of Object.entries(properties)) {
      fields[name] = schemaTypeToString(prop);
    }
  }

  return {
    status,
    type: schema['type'] as string | undefined,
    fields: Object.keys(fields).length > 0 ? fields : undefined,
    isArray: isArray || undefined,
  };
}

// --- schema helpers ----------------------------------------------------------

function schemaTypeToString(schema: Record<string, unknown>): string {
  const type = schema['type'] as string | undefined;
  if (!type) return 'string';
  if (type === 'integer' || type === 'number' || type === 'boolean')
    return type;
  if (type === 'array') return 'array';
  if (type === 'object') return 'object';
  return type;
}

/**
 * Extract a simple type string from a schema object. Swagger 2 puts the type
 * directly on the parameter object; OAS 3 nests it under `schema`.
 */
function schemaToType(
  schema: Record<string, unknown>,
  swagger2Param?: Record<string, unknown>
): string | undefined {
  const type =
    (schema['type'] as string | undefined) ??
    (swagger2Param?.['type'] as string | undefined);
  if (!type) return undefined;
  return type;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}
