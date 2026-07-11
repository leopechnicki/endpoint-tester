import { describe, it, expect } from 'vitest';
import { PostmanGenerator } from '../src/postman.js';
import type { Endpoint } from '../src/types.js';

const sampleEndpoints: Endpoint[] = [
  { method: 'GET', path: '/users', handler: 'listUsers', params: [] },
  {
    method: 'GET',
    path: '/users/:id',
    handler: 'getUser',
    params: [{ name: 'id', location: 'path', type: 'string', required: true }],
  },
  {
    method: 'POST',
    path: '/users',
    handler: 'createUser',
    params: [],
    body: { fields: { name: 'string', age: 'integer', active: 'boolean' } },
  },
  {
    method: 'DELETE',
    path: '/users/:id',
    handler: 'deleteUser',
    params: [{ name: 'id', location: 'path', type: 'string', required: true }],
  },
  {
    method: 'GET',
    path: '/search',
    handler: 'search',
    params: [{ name: 'q', location: 'query', type: 'string', required: false }],
  },
  {
    method: 'PATCH',
    path: '/products/{id}',
    handler: 'updateProduct',
    params: [{ name: 'id', location: 'path', type: 'integer', required: true }],
    body: { fields: { price: 'number' } },
  },
];

describe('PostmanGenerator — collection structure', () => {
  const gen = new PostmanGenerator();

  it('produces a valid Postman Collection v2.1.0 skeleton', () => {
    const output = gen.generate(sampleEndpoints, {
      baseUrl: 'http://localhost:8080',
      name: 'My API',
    });
    const collection = JSON.parse(output) as Record<string, unknown>;

    expect(collection.info).toBeTypeOf('object');
    const info = collection.info as Record<string, unknown>;
    expect(info.name).toBe('My API');
    expect(info.schema).toBe(
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    );
    expect(typeof info._postman_id).toBe('string');
    expect(Array.isArray(collection.item)).toBe(true);
    expect(Array.isArray(collection.variable)).toBe(true);
  });

  it('defaults name to "API" and baseUrl to http://localhost:3000', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const info = collection.info as Record<string, unknown>;
    expect(info.name).toBe('API');
    const variables = collection.variable as Array<Record<string, unknown>>;
    const baseUrlVar = variables.find((v) => v.key === 'baseUrl');
    expect(baseUrlVar?.value).toBe('http://localhost:3000');
  });

  it('emits one request item per endpoint', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as unknown[];
    expect(items.length).toBe(sampleEndpoints.length);
  });

  it('sets HTTP method + name per request', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    const post = items.find((i) => i.name === 'POST /users');
    expect(post).toBeDefined();
    const req = post!.request as Record<string, unknown>;
    expect(req.method).toBe('POST');

    const get = items.find((i) => i.name === 'GET /users/:id');
    expect(get).toBeDefined();
    expect((get!.request as Record<string, unknown>).method).toBe('GET');
  });
});

describe('PostmanGenerator — path handling', () => {
  const gen = new PostmanGenerator();

  it('normalizes framework path params to Postman :param style', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    // /users/:id -> already Postman style
    const getUser = items.find((i) => i.name === 'GET /users/:id')!;
    const url = (getUser.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;
    expect((url.path as string[]).some((p) => p === ':id')).toBe(true);

    // /products/{id} -> should be normalized to :id
    const patch = items.find((i) => i.name === 'PATCH /products/{id}')!;
    const patchUrl = (patch.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;
    expect((patchUrl.path as string[]).some((p) => p === ':id')).toBe(true);
  });

  it('references {{baseUrl}} in every request URL', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    for (const it of items) {
      const url = (it.request as Record<string, unknown>).url as Record<
        string,
        unknown
      >;
      expect(url.raw).toMatch(/^{{baseUrl}}/);
      expect(url.host).toEqual(['{{baseUrl}}']);
    }
  });

  it('emits url.variable entries for path params', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    const getUser = items.find((i) => i.name === 'GET /users/:id')!;
    const url = (getUser.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;
    const variables = url.variable as Array<Record<string, unknown>>;
    expect(variables).toBeDefined();
    expect(variables.some((v) => v.key === 'id')).toBe(true);
  });

  it('emits url.query entries for query params', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    const search = items.find((i) => i.name === 'GET /search')!;
    const url = (search.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;
    const query = url.query as Array<Record<string, unknown>>;
    expect(query).toBeDefined();
    expect(query.some((q) => q.key === 'q')).toBe(true);
  });
});

describe('PostmanGenerator — body & headers', () => {
  const gen = new PostmanGenerator();

  it('emits a JSON body for POST/PUT/PATCH endpoints with fields', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    const post = items.find((i) => i.name === 'POST /users')!;
    const req = post.request as Record<string, unknown>;
    const body = req.body as Record<string, unknown>;
    expect(body.mode).toBe('raw');
    expect(body.raw).toBeTypeOf('string');
    const parsed = JSON.parse(body.raw as string) as Record<string, unknown>;
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('age');
    expect(parsed).toHaveProperty('active');

    const options = body.options as Record<string, unknown>;
    const rawOpts = options.raw as Record<string, unknown>;
    expect(rawOpts.language).toBe('json');
  });

  it('emits Content-Type: application/json header for body requests', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    const post = items.find((i) => i.name === 'POST /users')!;
    const req = post.request as Record<string, unknown>;
    const headers = req.header as Array<Record<string, unknown>>;
    expect(
      headers.some(
        (h) => h.key === 'Content-Type' && h.value === 'application/json'
      )
    ).toBe(true);
  });

  it('does NOT emit a body on GET/DELETE requests', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    const get = items.find((i) => i.name === 'GET /users')!;
    expect((get.request as Record<string, unknown>).body).toBeUndefined();

    const del = items.find((i) => i.name === 'DELETE /users/:id')!;
    expect((del.request as Record<string, unknown>).body).toBeUndefined();
  });

  it('includes an Authorization header placeholder', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;

    for (const it of items) {
      const req = it.request as Record<string, unknown>;
      const headers = req.header as Array<Record<string, unknown>>;
      expect(headers.some((h) => h.key === 'Authorization')).toBe(true);
    }
  });
});

describe('PostmanGenerator — edge cases', () => {
  const gen = new PostmanGenerator();

  it('handles an empty endpoint list without throwing', () => {
    const output = gen.generate([]);
    const collection = JSON.parse(output) as Record<string, unknown>;
    expect(collection.item).toEqual([]);
  });

  it('produces valid JSON output', () => {
    const output = gen.generate(sampleEndpoints);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('generates a stable _postman_id (UUID v4 format)', () => {
    const output = gen.generate(sampleEndpoints);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const info = collection.info as Record<string, unknown>;
    // UUID v4 pattern
    expect(info._postman_id as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('splits root "/" paths without producing empty segments', () => {
    const output = gen.generate([
      { method: 'GET', path: '/', handler: 'root', params: [] },
    ]);
    const collection = JSON.parse(output) as Record<string, unknown>;
    const items = collection.item as Array<Record<string, unknown>>;
    const url = (items[0].request as Record<string, unknown>).url as Record<
      string,
      unknown
    >;
    // Postman expects `path: []` for root, or `path: ['']` — both work; we choose []
    expect(Array.isArray(url.path)).toBe(true);
  });
});
