import type { Endpoint, EndpointParam, HttpMethod } from './types.js';

/**
 * Options for generating a Postman Collection from discovered endpoints.
 */
export interface PostmanOptions {
  /** Collection display name (default: "API"). */
  name?: string;
  /** Server base URL, emitted as the `{{baseUrl}}` variable (default: http://localhost:3000). */
  baseUrl?: string;
  /** Collection description shown at the top of Postman. */
  description?: string;
}

/**
 * Generate a Postman Collection v2.1.0 document from endpoints discovered by the scanner.
 *
 * Output conforms to the Postman Collection Format 2.1.0 schema:
 *   https://schema.getpostman.com/json/collection/v2.1.0/collection.json
 *
 * Every request references a shared `{{baseUrl}}` collection variable so users can
 * flip environments (localhost, staging, prod) without editing individual requests.
 * Path params become url.variable entries; query params become url.query entries.
 * POST/PUT/PATCH endpoints receive a raw JSON body seeded from the inferred fields.
 * Every request also carries a placeholder `Authorization: Bearer {{authToken}}` header
 * — users override `authToken` in their Postman environment.
 */
export class PostmanGenerator {
  /**
   * Build the Postman collection and serialize it to a JSON string.
   */
  generate(endpoints: Endpoint[], options: PostmanOptions = {}): string {
    return JSON.stringify(this.buildCollection(endpoints, options), null, 2);
  }

  /**
   * Build the Postman collection as a plain object (useful programmatically).
   */
  buildCollection(
    endpoints: Endpoint[],
    options: PostmanOptions = {}
  ): Record<string, unknown> {
    const name = options.name ?? 'API';
    const baseUrl = options.baseUrl ?? 'http://localhost:3000';

    const info: Record<string, unknown> = {
      _postman_id: uuidv4(),
      name,
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    };
    if (options.description) {
      info.description = options.description;
    }

    return {
      info,
      item: endpoints.map((ep) => this.buildRequestItem(ep)),
      variable: [
        {
          key: 'baseUrl',
          value: baseUrl,
          type: 'string',
        },
        {
          key: 'authToken',
          value: '',
          type: 'string',
        },
      ],
    };
  }

  private buildRequestItem(ep: Endpoint): Record<string, unknown> {
    const request = this.buildRequest(ep);
    return {
      name: `${ep.method} ${ep.path}`,
      request,
      response: [],
    };
  }

  private buildRequest(ep: Endpoint): Record<string, unknown> {
    const request: Record<string, unknown> = {
      method: ep.method,
      header: this.buildHeaders(ep),
      url: this.buildUrl(ep),
    };
    if (hasBody(ep)) {
      request.body = this.buildBody(ep);
    }
    return request;
  }

  private buildHeaders(ep: Endpoint): Array<Record<string, unknown>> {
    const headers: Array<Record<string, unknown>> = [
      {
        key: 'Authorization',
        value: 'Bearer {{authToken}}',
        type: 'text',
      },
    ];
    if (hasBody(ep)) {
      headers.unshift({
        key: 'Content-Type',
        value: 'application/json',
        type: 'text',
      });
    }
    return headers;
  }

  private buildUrl(ep: Endpoint): Record<string, unknown> {
    const normalizedPath = normalizePath(ep.path);
    const segments = normalizedPath.split('/').filter((s) => s.length > 0);

    const queryParams = ep.params.filter((p) => p.location === 'query');
    const pathParams = ep.params.filter((p) => p.location === 'path');

    const url: Record<string, unknown> = {
      raw: buildRawUrl(normalizedPath, queryParams),
      host: ['{{baseUrl}}'],
      path: segments,
    };

    if (pathParams.length > 0) {
      url.variable = pathParams.map((p) => ({
        key: p.name,
        value: exampleValueFor(p),
        description: p.type ? `Path parameter (${p.type})` : 'Path parameter',
      }));
    }

    if (queryParams.length > 0) {
      url.query = queryParams.map((p) => ({
        key: p.name,
        value: exampleValueFor(p),
        disabled: !p.required,
        description: p.type ? `Query parameter (${p.type})` : 'Query parameter',
      }));
    }

    return url;
  }

  private buildBody(ep: Endpoint): Record<string, unknown> {
    const fields = ep.body?.fields ?? {};
    const skeleton: Record<string, unknown> = {};
    for (const [name, type] of Object.entries(fields)) {
      skeleton[name] = exampleForType(type);
    }

    return {
      mode: 'raw',
      raw: JSON.stringify(skeleton, null, 2),
      options: {
        raw: {
          language: 'json',
        },
      },
    };
  }
}

// --- helpers ------------------------------------------------------------------

const METHOD_HAS_BODY = new Set<HttpMethod>(['POST', 'PUT', 'PATCH']);

function hasBody(ep: Endpoint): boolean {
  return METHOD_HAS_BODY.has(ep.method);
}

/**
 * Normalize framework-specific path params to Postman-native `:name` style.
 * - Flask/Django `<int:id>` / `<id>` -> `:id`
 * - OpenAPI-style `{id}` -> `:id`
 * - Express-style `:id` -> already correct
 */
function normalizePath(path: string): string {
  return path
    .replace(/<(?:[^:>]+:)?([A-Za-z0-9_]+)>/g, ':$1') // Flask/Django  <int:id> | <id>
    .replace(/\{([A-Za-z0-9_]+)\}/g, ':$1'); // OpenAPI-style {id}
}

function buildRawUrl(
  normalizedPath: string,
  queryParams: EndpointParam[]
): string {
  const base = `{{baseUrl}}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
  const requiredQuery = queryParams
    .filter((p) => p.required)
    .map((p) => `${p.name}=${encodeURIComponent(exampleValueFor(p))}`);
  return requiredQuery.length > 0 ? `${base}?${requiredQuery.join('&')}` : base;
}

function exampleValueFor(p: EndpointParam): string {
  switch (p.type) {
    case 'integer':
    case 'int':
      return '1';
    case 'number':
    case 'float':
      return '1.0';
    case 'boolean':
    case 'bool':
      return 'true';
    default:
      return p.name === 'id' ? '1' : `example-${p.name}`;
  }
}

function exampleForType(type: string): unknown {
  switch (type) {
    case 'integer':
    case 'int':
      return 0;
    case 'number':
    case 'float':
      return 0.0;
    case 'boolean':
    case 'bool':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

/**
 * RFC 4122 v4 UUID generator (crypto-strong). Node 20+ ships crypto.randomUUID
 * as a native module — we import lazily so `postman.ts` stays dependency-free.
 */
function uuidv4(): string {
  // Prefer built-in — always available on Node >= 14.17.
  // Cast to any: TypeScript's Node types may not expose `randomUUID` on some setups.
  // Using dynamic property lookup so the module still typechecks on older `@types/node`.
  const globalCrypto = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  // Fallback: 122-bit random UUID (extremely unlikely to hit here on Node 20+).
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    );
  }
  hex[6] = ((parseInt(hex[6], 16) & 0x0f) | 0x40).toString(16).padStart(2, '0');
  hex[8] = ((parseInt(hex[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
