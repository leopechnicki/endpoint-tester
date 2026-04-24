import { describe, it, expect } from "vitest";
import { FastifyAdapter } from "../../src/adapters/fastify.js";

describe("FastifyAdapter — edge cases", () => {
  const adapter = new FastifyAdapter();

  it("parses fastify.route({}) where the options block spans more than 20 lines", () => {
    // Realistic schema blocks often exceed 20 lines; the adapter must
    // keep collecting until the closing `})` before giving up.
    const source = `
      import fastify from 'fastify';
      const app = fastify();

      app.route({
        method: 'POST',
        url: '/users',
        schema: {
          body: {
            type: 'object',
            required: ['name', 'email'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              age: { type: 'number' },
              nickname: { type: 'string' },
              bio: { type: 'string' },
              website: { type: 'string' },
              twitter: { type: 'string' },
              github: { type: 'string' },
              avatar: { type: 'string' },
              locale: { type: 'string' },
              timezone: { type: 'string' },
              metadata: { type: 'object' },
            },
          },
          response: {
            201: {
              type: 'object',
              properties: { id: { type: 'string' } },
            },
          },
        },
        handler: async (req, reply) => {
          return reply.code(201).send({ id: '1' });
        },
      });
    `;

    const endpoints = adapter.parse(source, "app.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("does not register nested plugin prefixes (documents known limitation)", () => {
    // `fastify.register(plugin, { prefix })` prefixes are not currently
    // resolved because the plugin function and its prefix are statically
    // disconnected. This test pins current behaviour so a future
    // improvement is intentional and reviewable.
    const source = `
      import fastify from 'fastify';
      const app = fastify();

      async function authRoutes(instance) {
        instance.get('/login', loginHandler);
        instance.post('/logout', logoutHandler);
      }

      app.register(authRoutes, { prefix: '/auth' });
    `;

    const endpoints = adapter.parse(source, "app.ts");
    const paths = endpoints.map((e) => e.path);
    // Current behaviour: prefixes are NOT applied.
    expect(paths).toContain("/login");
    expect(paths).toContain("/logout");
  });

  it("parses mixed shorthand and route() calls in the same file", () => {
    const source = `
      const app = fastify();

      app.get('/health', healthHandler);
      app.route({
        method: 'PUT',
        url: '/items/:id',
        handler: updateItem,
      });
      app.post('/items', createItem);
    `;

    const endpoints = adapter.parse(source);
    const signatures = endpoints.map((e) => `${e.method} ${e.path}`).sort();
    expect(signatures).toEqual([
      "GET /health",
      "POST /items",
      "PUT /items/:id",
    ]);
  });

  it("extracts :param as a path parameter when url lacks a leading slash", () => {
    const source = `
      fastify.get('users/:id', getUser);
    `;
    const [endpoint] = adapter.parse(source);
    expect(endpoint.path).toBe("/users/:id");
    expect(endpoint.params).toEqual([
      { name: "id", location: "path", type: "string", required: true },
    ]);
  });

  it("ignores fastify.route blocks that lack a method field", () => {
    // Defensive: malformed route options should not produce a phantom
    // endpoint with undefined method.
    const source = `
      app.route({
        url: '/broken',
        handler: foo,
      });
    `;
    const endpoints = adapter.parse(source);
    expect(endpoints).toEqual([]);
  });
});
