import { describe, it, expect } from 'vitest';
import {
  importOpenApiDocument,
  type ImportOptions,
} from '../src/openapi-import.js';
import type { Endpoint } from '../src/types.js';

// --- fixtures ----------------------------------------------------------------

const minimalOpenApi3: Record<string, unknown> = {
  openapi: '3.1.0',
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
                  age: { type: 'integer' },
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
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        operationId: 'deleteUser',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: { '204': { description: 'No Content' } },
      },
    },
  },
};

const swagger2Doc: Record<string, unknown> = {
  swagger: '2.0',
  info: { title: 'Legacy', version: '0.1.0' },
  basePath: '/api/v1',
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        parameters: [
          { name: 'page', in: 'query', type: 'integer', required: false },
        ],
        responses: {
          '200': {
            description: 'OK',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  title: { type: 'string' },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createItem',
        parameters: [
          {
            name: 'body',
            in: 'body',
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                price: { type: 'number' },
              },
            },
          },
        ],
        responses: { '201': { description: 'Created' } },
      },
    },
  },
};

const specWithQueryAndHeaderParams: Record<string, unknown> = {
  openapi: '3.0.3',
  info: { title: 'Search', version: '1.0.0' },
  paths: {
    '/search': {
      get: {
        operationId: 'search',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
          },
          {
            name: 'X-Request-Id',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

// --- tests -------------------------------------------------------------------

describe('importOpenApiDocument -- OpenAPI 3.x', () => {
  it('extracts all endpoints from an OpenAPI 3 spec', () => {
    const endpoints = importOpenApiDocument(minimalOpenApi3);
    expect(endpoints).toHaveLength(4);
    const methods = endpoints.map((e) => `${e.method} ${e.path}`).sort();
    expect(methods).toEqual([
      'DELETE /users/{id}',
      'GET /users',
      'GET /users/{id}',
      'POST /users',
    ]);
  });

  it('extracts path parameters with correct type', () => {
    const endpoints = importOpenApiDocument(minimalOpenApi3);
    const getUser = endpoints.find(
      (e) => e.method === 'GET' && e.path === '/users/{id}'
    )!;
    expect(getUser.params).toHaveLength(1);
    expect(getUser.params[0]).toMatchObject({
      name: 'id',
      location: 'path',
      type: 'integer',
      required: true,
    });
  });

  it('extracts request body fields from requestBody', () => {
    const endpoints = importOpenApiDocument(minimalOpenApi3);
    const createUser = endpoints.find(
      (e) => e.method === 'POST' && e.path === '/users'
    )!;
    expect(createUser.body).toBeDefined();
    expect(createUser.body!.fields).toEqual({ name: 'string', age: 'integer' });
  });

  it('extracts response fields and status code', () => {
    const endpoints = importOpenApiDocument(minimalOpenApi3);
    const getUser = endpoints.find(
      (e) => e.method === 'GET' && e.path === '/users/{id}'
    )!;
    expect(getUser.response).toBeDefined();
    expect(getUser.response!.status).toBe(200);
    expect(getUser.response!.fields).toEqual({ id: 'integer', name: 'string' });
  });

  it('uses operationId as handler name', () => {
    const endpoints = importOpenApiDocument(minimalOpenApi3);
    const listUsers = endpoints.find(
      (e) => e.method === 'GET' && e.path === '/users'
    )!;
    expect(listUsers.handler).toBe('listUsers');
  });

  it('uses empty string handler when operationId is missing', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/health': {
          get: { responses: { '200': { description: 'OK' } } },
        },
      },
    };
    const endpoints = importOpenApiDocument(spec);
    expect(endpoints[0].handler).toBe('');
  });
});

describe('importOpenApiDocument -- Swagger 2.0', () => {
  it('extracts endpoints with basePath prepended', () => {
    const endpoints = importOpenApiDocument(swagger2Doc);
    expect(endpoints).toHaveLength(2);
    const paths = endpoints.map((e) => e.path);
    expect(paths).toContain('/api/v1/items');
  });

  it('extracts query params from Swagger 2 parameters', () => {
    const endpoints = importOpenApiDocument(swagger2Doc);
    const listItems = endpoints.find((e) => e.method === 'GET')!;
    expect(listItems.params).toHaveLength(1);
    expect(listItems.params[0]).toMatchObject({
      name: 'page',
      location: 'query',
      type: 'integer',
      required: false,
    });
  });

  it('extracts body from Swagger 2 in:body parameter', () => {
    const endpoints = importOpenApiDocument(swagger2Doc);
    const createItem = endpoints.find((e) => e.method === 'POST')!;
    expect(createItem.body).toBeDefined();
    expect(createItem.body!.fields).toEqual({
      title: 'string',
      price: 'number',
    });
  });

  it('extracts array response with isArray flag', () => {
    const endpoints = importOpenApiDocument(swagger2Doc);
    const listItems = endpoints.find((e) => e.method === 'GET')!;
    expect(listItems.response).toBeDefined();
    expect(listItems.response!.isArray).toBe(true);
    expect(listItems.response!.fields).toEqual({
      id: 'integer',
      title: 'string',
    });
  });
});

describe('importOpenApiDocument -- query and header params', () => {
  it('extracts query and header parameters', () => {
    const endpoints = importOpenApiDocument(specWithQueryAndHeaderParams);
    const search = endpoints[0];
    expect(search.params).toHaveLength(3);

    const queryQ = search.params.find((p) => p.name === 'q')!;
    expect(queryQ.location).toBe('query');
    expect(queryQ.required).toBe(true);

    const queryLimit = search.params.find((p) => p.name === 'limit')!;
    expect(queryLimit.location).toBe('query');
    expect(queryLimit.required).toBe(false);

    const header = search.params.find((p) => p.name === 'X-Request-Id')!;
    expect(header.location).toBe('header');
  });
});

describe('importOpenApiDocument -- edge cases', () => {
  it('throws on null input', () => {
    expect(() =>
      importOpenApiDocument(null as unknown as Record<string, unknown>)
    ).toThrow(/expected an object/);
  });

  it('throws on missing paths key', () => {
    expect(() =>
      importOpenApiDocument({
        openapi: '3.0.0',
        info: { title: 'X', version: '1' },
      })
    ).toThrow(/missing.*paths/i);
  });

  it('returns empty array for empty paths object', () => {
    const endpoints = importOpenApiDocument({
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: {},
    });
    expect(endpoints).toEqual([]);
  });

  it('ignores non-HTTP keys in path items (e.g. parameters, summary)', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/items': {
          summary: 'Item operations',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          get: {
            operationId: 'listItems',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const endpoints = importOpenApiDocument(spec);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe('GET');
  });

  it('merges path-level and operation-level parameters', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/items/{id}': {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          get: {
            operationId: 'getItem',
            parameters: [
              {
                name: 'fields',
                in: 'query',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const endpoints = importOpenApiDocument(spec);
    expect(endpoints[0].params).toHaveLength(2);
    const names = endpoints[0].params.map((p) => p.name).sort();
    expect(names).toEqual(['fields', 'id']);
  });
});

describe('importOpenApiDocument -- options', () => {
  it('respects basePath override option', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/users': {
          get: {
            operationId: 'list',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const endpoints = importOpenApiDocument(spec, { basePath: '/api/v2' });
    expect(endpoints[0].path).toBe('/api/v2/users');
  });

  it('does not double-slash when basePath ends with / and path starts with /', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/items': {
          get: {
            operationId: 'list',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const endpoints = importOpenApiDocument(spec, { basePath: '/api/' });
    expect(endpoints[0].path).toBe('/api/items');
  });
});
