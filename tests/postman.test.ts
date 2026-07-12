import { describe, it, expect } from 'vitest';
import { PostmanGenerator } from '../src/postman.js';
import type { Endpoint } from '../src/types.js';

const generator = new PostmanGenerator();

const SAMPLE_ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/users',
    handler: 'listUsers',
    params: [
      { name: 'page', location: 'query', type: 'integer', required: false },
      { name: 'limit', location: 'query', type: 'integer', required: false },
    ],
  },
  {
    method: 'POST',
    path: '/users',
    handler: 'createUser',
    params: [],
    body: {
      type: 'object',
      fields: { name: 'string', email: 'string', age: 'integer' },
    },
  },
  {
    method: 'GET',
    path: '/users/:id',
    handler: 'getUser',
    params: [{ name: 'id', location: 'path', type: 'string', required: true }],
  },
  {
    method: 'PUT',
    path: '/users/:id',
    handler: 'updateUser',
    params: [{ name: 'id', location: 'path', type: 'string', required: true }],
    body: {
      type: 'object',
      fields: { name: 'string', email: 'string' },
    },
  },
  {
    method: 'DELETE',
    path: '/users/:id',
    handler: 'deleteUser',
    params: [{ name: 'id', location: 'path', type: 'string', required: true }],
  },
];

describe('PostmanGenerator', () => {
  it('generates a valid Postman Collection v2.1', () => {
    const output = generator.generate(SAMPLE_ENDPOINTS, {
      name: 'User API',
      baseUrl: 'http://localhost:3000',
    });

    const collection = JSON.parse(output);

    expect(collection.info.name).toBe('User API');
    expect(collection.info.schema).toBe(
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    );
  });

  it('creates one request per endpoint', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    // All under /users -- single group, no folders
    expect(items).toHaveLength(5);
  });

  it('sets correct HTTP method on each request', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    const methods = items.map(
      (item) => (item.request as Record<string, unknown>).method
    );
    expect(methods).toEqual(['GET', 'POST', 'GET', 'PUT', 'DELETE']);
  });

  it('includes request body for POST/PUT/PATCH', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    const postItem = items.find((i) => i.name === 'createUser');
    const postReq = postItem!.request as Record<string, unknown>;
    const body = postReq.body as Record<string, unknown>;

    expect(body).toBeDefined();
    expect(body.mode).toBe('raw');

    const rawBody = JSON.parse(body.raw as string);
    expect(rawBody).toHaveProperty('name');
    expect(rawBody).toHaveProperty('email');
    expect(rawBody).toHaveProperty('age');
    expect(rawBody.age).toBe(1);
    expect(rawBody.name).toBe('test-name');
  });

  it('does not include body for GET/DELETE', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    const getItem = items.find((i) => i.name === 'listUsers');
    const getReq = getItem!.request as Record<string, unknown>;
    expect(getReq.body).toBeUndefined();

    const deleteItem = items.find((i) => i.name === 'deleteUser');
    const deleteReq = deleteItem!.request as Record<string, unknown>;
    expect(deleteReq.body).toBeUndefined();
  });

  it('includes query parameters in URL', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    const listItem = items.find((i) => i.name === 'listUsers');
    const url = (listItem!.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;

    const query = url.query as Record<string, string>[];
    expect(query).toHaveLength(2);
    expect(query[0].key).toBe('page');
    expect(query[1].key).toBe('limit');
  });

  it('includes path variables in URL', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    const getByIdItem = items.find((i) => i.name === 'getUser');
    const url = (getByIdItem!.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;

    const variables = url.variable as Record<string, string>[];
    expect(variables).toHaveLength(1);
    expect(variables[0].key).toBe('id');
  });

  it('includes Authorization header on all requests', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    for (const item of items) {
      const req = item.request as Record<string, unknown>;
      const headers = req.header as Record<string, string>[];
      const authHeader = headers.find((h) => h.key === 'Authorization');
      expect(authHeader).toBeDefined();
      expect(authHeader!.value).toBe('Bearer {{authToken}}');
    }
  });

  it('includes Content-Type header only for body methods', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    const items = collection.item as Record<string, unknown>[];

    const getItem = items.find((i) => i.name === 'listUsers');
    const getHeaders = (getItem!.request as Record<string, unknown>)
      .header as Record<string, string>[];
    const getContentType = getHeaders.find((h) => h.key === 'Content-Type');
    expect(getContentType).toBeUndefined();

    const postItem = items.find((i) => i.name === 'createUser');
    const postHeaders = (postItem!.request as Record<string, unknown>)
      .header as Record<string, string>[];
    const postContentType = postHeaders.find((h) => h.key === 'Content-Type');
    expect(postContentType).toBeDefined();
    expect(postContentType!.value).toBe('application/json');
  });

  it('includes collection-level variables', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS, {
      baseUrl: 'http://api.example.com',
    });

    const variables = collection.variable as Record<string, string>[];
    expect(variables).toHaveLength(2);

    const baseUrlVar = variables.find((v) => v.key === 'baseUrl');
    expect(baseUrlVar!.value).toBe('http://api.example.com');

    const authVar = variables.find((v) => v.key === 'authToken');
    expect(authVar).toBeDefined();
  });

  it('creates folders for multiple path prefixes', () => {
    const endpoints: Endpoint[] = [
      { method: 'GET', path: '/users', handler: 'listUsers', params: [] },
      { method: 'GET', path: '/orders', handler: 'listOrders', params: [] },
    ];

    const collection = generator.buildCollection(endpoints);
    const items = collection.item as Record<string, unknown>[];

    // Two different prefixes -> folders
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveProperty('name', '/users');
    expect(items[0]).toHaveProperty('item');
    expect(items[1]).toHaveProperty('name', '/orders');
    expect(items[1]).toHaveProperty('item');
  });

  it('handles endpoints without a handler name', () => {
    const endpoints: Endpoint[] = [
      { method: 'GET', path: '/health', handler: '', params: [] },
    ];

    const collection = generator.buildCollection(endpoints);
    const items = collection.item as Record<string, unknown>[];

    // Falls back to "METHOD path" for the name
    expect(items[0].name).toBe('GET /health');
  });

  it('generates valid JSON output', () => {
    const output = generator.generate(SAMPLE_ENDPOINTS);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('uses default name and baseUrl', () => {
    const collection = generator.buildCollection(SAMPLE_ENDPOINTS);
    expect(collection.info).toEqual(expect.objectContaining({ name: 'API' }));

    const variables = collection.variable as Record<string, string>[];
    const baseUrlVar = variables.find((v) => v.key === 'baseUrl');
    expect(baseUrlVar!.value).toBe('http://localhost:3000');
  });
});
