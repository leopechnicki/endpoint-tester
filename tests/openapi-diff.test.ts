import { describe, it, expect } from 'vitest';
import {
  diffOpenApi,
  parseOpenApiEndpoints,
  formatDiff,
  type DiffResult,
} from '../src/openapi-diff.js';
import type { Endpoint } from '../src/types.js';

const sampleSpec = {
  openapi: '3.1.0',
  info: { title: 'API', version: '1.0.0' },
  paths: {
    '/users': {
      get: { summary: 'list', responses: { '200': { description: 'OK' } } },
      post: {
        summary: 'create',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/users/{id}': {
      get: {
        summary: 'read',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { '200': { description: 'OK' } },
      },
      delete: {
        summary: 'delete',
        responses: { '204': { description: 'No Content' } },
      },
    },
  },
};

describe('parseOpenApiEndpoints', () => {
  it('extracts endpoints from a valid OpenAPI 3.1 document', () => {
    const endpoints = parseOpenApiEndpoints(sampleSpec);
    expect(endpoints).toHaveLength(4);
    const keys = endpoints.map((e) => `${e.method}:${e.path}`).sort();
    expect(keys).toEqual([
      'DELETE:/users/{id}',
      'GET:/users',
      'GET:/users/{id}',
      'POST:/users',
    ]);
  });

  it('lowercases path items but uppercases HTTP methods', () => {
    const endpoints = parseOpenApiEndpoints(sampleSpec);
    for (const ep of endpoints) {
      expect(ep.method).toEqual(ep.method.toUpperCase());
    }
  });

  it('ignores non-method keys like "parameters", "summary", "$ref"', () => {
    const specWithNoise = {
      ...sampleSpec,
      paths: {
        '/foo': {
          summary: 'This is not a method',
          parameters: [],
          $ref: '#/components/pathItems/foo',
          get: { responses: { '200': { description: 'OK' } } },
        },
      },
    };
    const endpoints = parseOpenApiEndpoints(specWithNoise);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe('GET');
    expect(endpoints[0].path).toBe('/foo');
  });

  it('throws on invalid input shape', () => {
    expect(() =>
      parseOpenApiEndpoints({} as unknown as Record<string, unknown>)
    ).toThrow(/paths/i);
    expect(() =>
      parseOpenApiEndpoints({ paths: 'oops' } as unknown as Record<
        string,
        unknown
      >)
    ).toThrow(/paths/i);
  });
});

describe('diffOpenApi -- perfect match', () => {
  it('reports no drift when discovered endpoints match the spec exactly', () => {
    const discovered: Endpoint[] = [
      { method: 'GET', path: '/users', handler: 'listUsers', params: [] },
      { method: 'POST', path: '/users', handler: 'createUser', params: [] },
      {
        method: 'GET',
        path: '/users/:id',
        handler: 'getUser',
        params: [{ name: 'id', location: 'path', required: true }],
      },
      {
        method: 'DELETE',
        path: '/users/:id',
        handler: 'deleteUser',
        params: [],
      },
    ];
    const result: DiffResult = diffOpenApi(discovered, sampleSpec);
    expect(result.hasDrift).toBe(false);
    expect(result.missingInSource).toEqual([]);
    expect(result.missingInSpec).toEqual([]);
    expect(result.matched).toHaveLength(4);
  });
});

describe('diffOpenApi -- drift detection', () => {
  it('reports endpoints missing from the source code', () => {
    const discovered: Endpoint[] = [
      { method: 'GET', path: '/users', handler: 'listUsers', params: [] },
    ];
    const result = diffOpenApi(discovered, sampleSpec);
    expect(result.hasDrift).toBe(true);
    const keys = result.missingInSource
      .map((e) => `${e.method}:${e.path}`)
      .sort();
    expect(keys).toContain('POST:/users');
    expect(keys).toContain('GET:/users/{id}');
    expect(keys).toContain('DELETE:/users/{id}');
    expect(result.missingInSpec).toEqual([]);
  });

  it('reports endpoints missing from the spec', () => {
    const discovered: Endpoint[] = [
      { method: 'GET', path: '/users', handler: 'listUsers', params: [] },
      { method: 'POST', path: '/users', handler: 'createUser', params: [] },
      {
        method: 'GET',
        path: '/users/:id',
        handler: 'getUser',
        params: [{ name: 'id', location: 'path', required: true }],
      },
      {
        method: 'DELETE',
        path: '/users/:id',
        handler: 'deleteUser',
        params: [],
      },
      {
        method: 'PATCH',
        path: '/products/:id',
        handler: 'updateProduct',
        params: [],
      },
    ];
    const result = diffOpenApi(discovered, sampleSpec);
    expect(result.hasDrift).toBe(true);
    expect(result.missingInSpec.map((e) => `${e.method}:${e.path}`)).toEqual([
      'PATCH:/products/{id}',
    ]);
    expect(result.missingInSource).toEqual([]);
  });

  it('reports both directions when both diverge', () => {
    const discovered: Endpoint[] = [
      { method: 'GET', path: '/users', handler: 'listUsers', params: [] },
      {
        method: 'PATCH',
        path: '/products/:id',
        handler: 'updateProduct',
        params: [],
      },
    ];
    const result = diffOpenApi(discovered, sampleSpec);
    expect(result.hasDrift).toBe(true);
    expect(result.missingInSource.length).toBe(3);
    expect(result.missingInSpec.length).toBe(1);
  });
});

describe('diffOpenApi -- path normalisation', () => {
  it('treats Express :id and OpenAPI {id} as the same path', () => {
    const discovered: Endpoint[] = [
      {
        method: 'GET',
        path: '/users/:id',
        handler: 'getUser',
        params: [{ name: 'id', location: 'path', required: true }],
      },
    ];
    const spec = {
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0.0' },
      paths: {
        '/users/{id}': {
          get: { responses: { '200': { description: 'OK' } } },
        },
      },
    };
    const result = diffOpenApi(discovered, spec);
    expect(result.hasDrift).toBe(false);
  });

  it('treats Flask <int:id> as {id}', () => {
    const discovered: Endpoint[] = [
      {
        method: 'GET',
        path: '/users/<int:id>',
        handler: 'get_user',
        params: [
          { name: 'id', location: 'path', required: true, type: 'integer' },
        ],
      },
    ];
    const spec = {
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0.0' },
      paths: {
        '/users/{id}': {
          get: { responses: { '200': { description: 'OK' } } },
        },
      },
    };
    const result = diffOpenApi(discovered, spec);
    expect(result.hasDrift).toBe(false);
  });
});

describe('formatDiff -- CLI-friendly output', () => {
  it('produces an in-sync message when no drift', () => {
    const result: DiffResult = {
      hasDrift: false,
      matched: [],
      missingInSource: [],
      missingInSpec: [],
    };
    const output = formatDiff(result);
    expect(output).toMatch(/in sync/i);
  });

  it('lists missing endpoints in both directions when drift present', () => {
    const result: DiffResult = {
      hasDrift: true,
      matched: [],
      missingInSource: [{ method: 'POST', path: '/users' }],
      missingInSpec: [{ method: 'PATCH', path: '/products/{id}' }],
    };
    const output = formatDiff(result);
    expect(output).toContain('POST /users');
    expect(output).toContain('PATCH /products/{id}');
    // Both direction labels should be present
    expect(output).toMatch(/spec.*not in.*source/i);
    expect(output).toMatch(/source.*not in.*spec/i);
  });
});
