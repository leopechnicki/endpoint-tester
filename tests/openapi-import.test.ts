import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  importOpenApiSpec,
  importOpenApiString,
  parseSimpleYaml,
} from '../src/openapi-import.js';

const TEST_DIR = join(tmpdir(), 'endpoint-tester-openapi-import-test');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Sample OpenAPI 3.1 spec
// ---------------------------------------------------------------------------
const SAMPLE_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Pet Store', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3000' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List all pets',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'A list of pets',
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
      post: {
        operationId: 'createPet',
        summary: 'Create a pet',
        requestBody: {
          required: true,
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
        responses: {
          '201': { description: 'Created' },
        },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        summary: 'Get a pet by ID',
        parameters: [
          {
            name: 'petId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'A pet' },
        },
      },
      delete: {
        operationId: 'deletePet',
        parameters: [
          {
            name: 'petId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': { description: 'No Content' },
        },
      },
    },
  },
};

describe('importOpenApiSpec (JSON)', () => {
  it('parses endpoints from a JSON spec file', () => {
    const specPath = join(TEST_DIR, 'spec.json');
    writeFileSync(specPath, JSON.stringify(SAMPLE_SPEC, null, 2));

    const endpoints = importOpenApiSpec(specPath);

    expect(endpoints).toHaveLength(4);

    const listPets = endpoints.find(
      (e) => e.method === 'GET' && e.path === '/pets'
    );
    expect(listPets).toBeDefined();
    expect(listPets!.handler).toBe('listPets');
    expect(listPets!.params).toHaveLength(1);
    expect(listPets!.params[0].name).toBe('limit');
    expect(listPets!.params[0].location).toBe('query');
    expect(listPets!.params[0].type).toBe('integer');

    const createPet = endpoints.find((e) => e.method === 'POST');
    expect(createPet).toBeDefined();
    expect(createPet!.body).toBeDefined();
    expect(createPet!.body!.fields).toEqual({
      name: 'string',
      age: 'integer',
    });
  });

  it('converts {param} paths to :param format', () => {
    const specPath = join(TEST_DIR, 'spec.json');
    writeFileSync(specPath, JSON.stringify(SAMPLE_SPEC, null, 2));

    const endpoints = importOpenApiSpec(specPath);

    const getPet = endpoints.find(
      (e) => e.method === 'GET' && e.path.includes('petId')
    );
    expect(getPet).toBeDefined();
    expect(getPet!.path).toBe('/pets/:petId');
    expect(getPet!.params).toHaveLength(1);
    expect(getPet!.params[0].name).toBe('petId');
    expect(getPet!.params[0].location).toBe('path');
  });

  it('extracts response status codes', () => {
    const specPath = join(TEST_DIR, 'spec.json');
    writeFileSync(specPath, JSON.stringify(SAMPLE_SPEC, null, 2));

    const endpoints = importOpenApiSpec(specPath);

    const createPet = endpoints.find((e) => e.method === 'POST');
    expect(createPet!.response?.status).toBe(201);

    const deletePet = endpoints.find((e) => e.method === 'DELETE');
    expect(deletePet!.response?.status).toBe(204);
  });

  it('extracts response fields', () => {
    const specPath = join(TEST_DIR, 'spec.json');
    writeFileSync(specPath, JSON.stringify(SAMPLE_SPEC, null, 2));

    const endpoints = importOpenApiSpec(specPath);

    const listPets = endpoints.find(
      (e) => e.method === 'GET' && e.path === '/pets'
    );
    expect(listPets!.response?.fields).toEqual({
      id: 'integer',
      name: 'string',
    });
  });

  it('returns empty array for spec with no paths', () => {
    const specPath = join(TEST_DIR, 'empty.json');
    writeFileSync(
      specPath,
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Empty', version: '1.0.0' },
      })
    );

    const endpoints = importOpenApiSpec(specPath);
    expect(endpoints).toHaveLength(0);
  });
});

describe('importOpenApiString', () => {
  it('parses endpoints from a JSON string', () => {
    const endpoints = importOpenApiString(JSON.stringify(SAMPLE_SPEC));
    expect(endpoints).toHaveLength(4);
  });

  it('parses endpoints from a YAML string', () => {
    const yaml = `openapi: "3.1.0"
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: "OK"
    post:
      operationId: createUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        "201":
          description: "Created"`;

    const endpoints = importOpenApiString(yaml, 'yaml');
    expect(endpoints).toHaveLength(2);

    const getUsers = endpoints.find((e) => e.method === 'GET');
    expect(getUsers).toBeDefined();
    expect(getUsers!.handler).toBe('listUsers');

    const postUsers = endpoints.find((e) => e.method === 'POST');
    expect(postUsers).toBeDefined();
    expect(postUsers!.handler).toBe('createUser');
    expect(postUsers!.body?.fields).toEqual({ name: 'string' });
  });
});

describe('importOpenApiSpec (YAML file)', () => {
  it('parses endpoints from a YAML spec file', () => {
    const yaml = `openapi: "3.1.0"
info:
  title: "YAML API"
  version: "1.0.0"
paths:
  /items:
    get:
      operationId: listItems
      parameters:
        - name: page
          in: query
          required: false
          schema:
            type: integer
      responses:
        "200":
          description: "OK"
  /items/{id}:
    put:
      operationId: updateItem
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
                price:
                  type: number
      responses:
        "200":
          description: "Updated"`;

    const specPath = join(TEST_DIR, 'spec.yaml');
    writeFileSync(specPath, yaml);

    const endpoints = importOpenApiSpec(specPath);
    expect(endpoints).toHaveLength(2);

    const listItems = endpoints.find((e) => e.method === 'GET');
    expect(listItems).toBeDefined();
    expect(listItems!.params).toHaveLength(1);
    expect(listItems!.params[0].name).toBe('page');

    const updateItem = endpoints.find((e) => e.method === 'PUT');
    expect(updateItem).toBeDefined();
    expect(updateItem!.path).toBe('/items/:id');
    expect(updateItem!.body?.fields).toEqual({
      title: 'string',
      price: 'number',
    });
  });
});

describe('parseSimpleYaml', () => {
  it('parses simple key-value pairs', () => {
    const result = parseSimpleYaml('name: test\nversion: 1');
    expect(result).toEqual({ name: 'test', version: 1 });
  });

  it('parses nested objects', () => {
    const result = parseSimpleYaml('info:\n  title: API\n  version: "1.0.0"');
    expect(result).toEqual({ info: { title: 'API', version: '1.0.0' } });
  });

  it('parses booleans and null', () => {
    const result = parseSimpleYaml(
      'enabled: true\ndisabled: false\nempty: null'
    );
    expect(result).toEqual({ enabled: true, disabled: false, empty: null });
  });

  it('parses quoted strings', () => {
    const result = parseSimpleYaml('"200": description\n\'key\': value');
    expect(result).toEqual({ '200': 'description', key: 'value' });
  });

  it('handles empty objects and arrays', () => {
    const result = parseSimpleYaml('obj: {}\narr: []');
    expect(result).toEqual({ obj: {}, arr: [] });
  });

  it('skips comments', () => {
    const result = parseSimpleYaml('# This is a comment\nname: test');
    expect(result).toEqual({ name: 'test' });
  });
});

describe('edge cases', () => {
  it('handles header parameters', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/secure': {
          get: {
            operationId: 'secureEndpoint',
            parameters: [
              {
                name: 'X-API-Key',
                in: 'header',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const endpoints = importOpenApiString(JSON.stringify(spec));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].location).toBe('header');
    expect(endpoints[0].params[0].required).toBe(true);
  });

  it('skips cookie parameters', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'test',
            parameters: [
              { name: 'session', in: 'cookie', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const endpoints = importOpenApiString(JSON.stringify(spec));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].params).toHaveLength(0);
  });

  it('handles missing operationId', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/no-id': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const endpoints = importOpenApiString(JSON.stringify(spec));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).toBe('');
  });

  it('handles Swagger 2.x style paths', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Legacy', version: '1.0' },
      paths: {
        '/legacy/{id}': {
          get: {
            operationId: 'getLegacy',
            parameters: [
              { name: 'id', in: 'path', required: true, type: 'string' },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const endpoints = importOpenApiString(JSON.stringify(spec));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe('/legacy/:id');
  });

  it('handles multiple path params', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/users/{userId}/posts/{postId}': {
          get: {
            operationId: 'getUserPost',
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'postId',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const endpoints = importOpenApiString(JSON.stringify(spec));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe('/users/:userId/posts/:postId');
    expect(endpoints[0].params).toHaveLength(2);
  });
});
