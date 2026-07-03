import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { OpenApiGenerator, toYaml } from '../src/openapi.js';
import { TestGenerator } from '../src/generator.js';
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
    response: { fields: { id: 'integer', title: 'string' }, isArray: true },
  },
];

describe('OpenApiGenerator — document structure', () => {
  const gen = new OpenApiGenerator();

  it('produces a valid OpenAPI 3.1 document skeleton', () => {
    const doc = gen.buildDocument(sampleEndpoints, {
      baseUrl: 'http://localhost:8080',
      title: 'My API',
      version: '2.1.0',
    });

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toEqual({ title: 'My API', version: '2.1.0' });
    expect(doc.servers).toEqual([{ url: 'http://localhost:8080' }]);
    expect(doc.paths).toBeTypeOf('object');
  });

  it('defaults title/version and omits servers when no baseUrl', () => {
    const doc = gen.buildDocument(sampleEndpoints) as Record<string, unknown>;
    expect(doc.info).toEqual({ title: 'API', version: '1.0.0' });
    expect(doc.servers).toBeUndefined();
  });

  it('normalizes path params to OpenAPI {name} style', () => {
    const doc = gen.buildDocument(sampleEndpoints) as Record<string, unknown>;
    const paths = doc.paths as Record<string, unknown>;
    expect(paths).toHaveProperty('/users/{id}');
    expect(paths).not.toHaveProperty('/users/:id');
  });

  it('normalizes Flask/Django typed path params', () => {
    const doc = gen.buildDocument([
      {
        method: 'GET',
        path: '/items/<int:pk>',
        handler: 'getItem',
        params: [],
      },
      { method: 'GET', path: '/tags/<slug>', handler: 'getTag', params: [] },
    ]) as Record<string, unknown>;
    const paths = doc.paths as Record<string, unknown>;
    expect(paths).toHaveProperty('/items/{pk}');
    expect(paths).toHaveProperty('/tags/{slug}');
  });

  it('merges multiple methods on the same path into one path item', () => {
    const doc = gen.buildDocument(sampleEndpoints) as Record<string, unknown>;
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths['/users/{id}']).sort()).toEqual(['delete', 'get']);
  });
});

describe('OpenApiGenerator — operations', () => {
  const gen = new OpenApiGenerator();
  const doc = gen.buildDocument(sampleEndpoints, {
    baseUrl: 'http://localhost:3000',
  }) as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  const paths = doc.paths;

  it('marks path parameters as required with a schema', () => {
    const op = paths['/users/{id}'].get;
    const params = op.parameters as Array<Record<string, unknown>>;
    expect(params).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('emits query params with required:false by default', () => {
    const op = paths['/search'].get;
    const params = op.parameters as Array<Record<string, unknown>>;
    expect(params[0]).toMatchObject({
      name: 'q',
      in: 'query',
      required: false,
    });
  });

  it('builds a JSON requestBody for POST with typed fields', () => {
    const op = paths['/users'].post;
    expect(op.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
              active: { type: 'boolean' },
            },
          },
        },
      },
    });
  });

  it('does not emit a requestBody for GET', () => {
    expect(paths['/users'].get.requestBody).toBeUndefined();
  });

  it('uses method-specific success status codes', () => {
    expect(Object.keys(paths['/users'].get.responses as object)).toEqual([
      '200',
    ]);
    expect(Object.keys(paths['/users'].post.responses as object)).toEqual([
      '201',
    ]);
    expect(
      Object.keys(paths['/users/{id}'].delete.responses as object)
    ).toEqual(['204']);
  });

  it('emits an array response schema when isArray is set', () => {
    const responses = paths['/search'].get.responses as Record<
      string,
      Record<string, unknown>
    >;
    const content = responses['200'].content as Record<
      string,
      Record<string, unknown>
    >;
    expect(content['application/json'].schema).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' }, title: { type: 'string' } },
      },
    });
  });

  it('204 responses carry no content', () => {
    const responses = paths['/users/{id}'].delete.responses as Record<
      string,
      Record<string, unknown>
    >;
    expect(responses['204'].content).toBeUndefined();
    expect(responses['204'].description).toBe('No Content');
  });

  it('falls back to a generated operationId when handler is empty', () => {
    const d = gen.buildDocument([
      { method: 'GET', path: '/health', handler: '', params: [] },
    ]) as Record<string, Record<string, Record<string, unknown>>>;
    expect(d.paths['/health'].get.operationId).toBe('get_health');
  });

  it('falls back when handler is a non-identifier placeholder like <unknown>', () => {
    const d = gen.buildDocument([
      {
        method: 'POST',
        path: '/imrobot/verify',
        handler: '<unknown>',
        params: [],
      },
    ]) as Record<string, Record<string, Record<string, unknown>>>;
    expect(d.paths['/imrobot/verify'].post.operationId).toBe(
      'post_imrobot_verify'
    );
  });

  // Regression coverage for CONSOLIDATED#4 (2026-07-02 audit): a Flask app with
  // @app.route('/users', methods=['POST','PUT']) emits two operations sharing the
  // same handler name. OAS 3.1 requires operationId uniqueness; before the fix,
  // openapi_spec_validator rejected the spec.
  it('appends method suffix when the same handler is reused across methods (uniqueness)', () => {
    const d = gen.buildDocument([
      {
        method: 'POST',
        path: '/users',
        handler: 'create_or_update_user',
        params: [],
      },
      {
        method: 'PUT',
        path: '/users',
        handler: 'create_or_update_user',
        params: [],
      },
    ]) as Record<string, Record<string, Record<string, unknown>>>;

    expect(d.paths['/users'].post.operationId).toBe(
      'create_or_update_user_post'
    );
    expect(d.paths['/users'].put.operationId).toBe('create_or_update_user_put');
  });

  it('leaves single-method operationId unchanged (no unnecessary suffix)', () => {
    const d = gen.buildDocument([
      {
        method: 'GET',
        path: '/users/{id}',
        handler: 'get_user',
        params: [
          { name: 'id', location: 'path', type: 'string', required: true },
        ],
      },
    ]) as Record<string, Record<string, Record<string, unknown>>>;

    // No collision -> preserve the bare handler name for backward compat
    expect(d.paths['/users/{id}'].get.operationId).toBe('get_user');
  });

  it('emits globally unique operationIds across the full spec', () => {
    const d = gen.buildDocument([
      { method: 'POST', path: '/users', handler: 'upsert', params: [] },
      { method: 'PUT', path: '/users', handler: 'upsert', params: [] },
      { method: 'GET', path: '/users', handler: 'list_users', params: [] },
      {
        method: 'DELETE',
        path: '/users/{id}',
        handler: 'remove_user',
        params: [],
      },
    ]) as Record<string, Record<string, Record<string, unknown>>>;

    const ids = [
      d.paths['/users'].post.operationId,
      d.paths['/users'].put.operationId,
      d.paths['/users'].get.operationId,
      d.paths['/users/{id}'].delete.operationId,
    ];
    // Set-uniqueness guarantees spec-valid output on OAS 3.1
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Regression coverage for CONSOLIDATED#6 (2026-07-02 audit): OpenAPI output
  // must reflect the handler-inferred status when present, not the HTTP-method
  // default. A Flask handler returning `(payload, 202)` used to ship a spec
  // claiming the endpoint returns 200/201 — misleading for downstream tools.
  it('honors scanner-inferred response.status over the method default', () => {
    const d = gen.buildDocument([
      {
        method: 'POST',
        path: '/queue',
        handler: 'enqueue',
        params: [],
        response: { status: 202, fields: { id: 'string' } },
      },
    ]) as Record<string, Record<string, Record<string, unknown>>>;

    const responses = d.paths['/queue'].post.responses as Record<
      string,
      unknown
    >;
    expect(Object.keys(responses)).toEqual(['202']);
    expect(responses['201']).toBeUndefined();
  });

  it('inferred 204 emits a no-content response even for GET', () => {
    const d = gen.buildDocument([
      {
        method: 'GET',
        path: '/health/quiet',
        handler: 'healthQuiet',
        params: [],
        response: { status: 204 },
      },
    ]) as Record<string, Record<string, Record<string, unknown>>>;

    const responses = d.paths['/health/quiet'].get.responses as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(responses)).toEqual(['204']);
    expect(responses['204'].description).toBe('No Content');
    expect(responses['204'].content).toBeUndefined();
  });
});

describe('OpenApiGenerator — serialization', () => {
  const gen = new OpenApiGenerator();

  it('emits valid JSON by default', () => {
    const out = gen.generate(sampleEndpoints, {
      baseUrl: 'http://localhost:3000',
    });
    const parsed = JSON.parse(out);
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.paths['/users/{id}'].get).toBeDefined();
  });

  it('emits YAML that parses back to the same document', () => {
    const opts = {
      baseUrl: 'http://localhost:3000',
      title: 'RT',
      version: '9.9.9',
    } as const;
    const doc = gen.buildDocument(sampleEndpoints, opts);
    const ymlStr = gen.generate(sampleEndpoints, { ...opts, format: 'yaml' });
    const reparsed = yaml.load(ymlStr);
    expect(reparsed).toEqual(doc);
  });

  it('quotes path keys containing braces so YAML stays valid', () => {
    const ymlStr = gen.generate(sampleEndpoints, { format: 'yaml' });
    expect(ymlStr).toContain('"/users/{id}":');
    // round-trips
    const reparsed = yaml.load(ymlStr) as Record<
      string,
      Record<string, unknown>
    >;
    expect(reparsed.paths).toHaveProperty('/users/{id}');
  });

  it('quotes numeric status-code keys in YAML', () => {
    const ymlStr = gen.generate(sampleEndpoints, { format: 'yaml' });
    expect(ymlStr).toContain('"200":');
    expect(ymlStr).toContain('"201":');
  });
});

describe('toYaml — primitive handling', () => {
  it('round-trips nested objects, arrays, and scalars', () => {
    const obj = {
      a: 1,
      b: 'two',
      c: true,
      d: null,
      e: [1, 2, 3],
      f: { g: ['x', 'y'], h: {} },
      i: [],
    };
    expect(yaml.load(toYaml(obj))).toEqual(obj);
  });

  it('handles arrays of objects', () => {
    const obj = { servers: [{ url: 'http://a' }, { url: 'http://b' }] };
    expect(yaml.load(toYaml(obj))).toEqual(obj);
  });
});

describe('TestGenerator integration', () => {
  it("routes the 'openapi' format through generate()", () => {
    const out = new TestGenerator().generate({
      endpoints: sampleEndpoints,
      output: './out',
      format: 'openapi',
      baseUrl: 'http://localhost:3000',
    });
    const parsed = JSON.parse(out);
    expect(parsed.openapi).toBe('3.1.0');
  });
});
