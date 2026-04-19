import { describe, it, expect } from "vitest";
import { FastifyAdapter } from "../../src/adapters/fastify.js";

describe("FastifyAdapter", () => {
  const adapter = new FastifyAdapter();

  it("should detect fastify.get() route", () => {
    const source = `fastify.get('/users', async (req, reply) => { reply.send({ id: 1 }); });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should detect fastify.post() route", () => {
    const source = `fastify.post('/users', async (req, reply) => { reply.send({ id: 1 }); });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should extract path parameters", () => {
    const source = `server.get('/users/:id', getUser);`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("id");
    expect(endpoints[0].params[0].location).toBe("path");
  });

  it("should detect multiple routes", () => {
    const source = `
      fastify.get('/users', listUsers);
      fastify.post('/users', createUser);
      fastify.get('/users/:id', getUser);
      fastify.put('/users/:id', updateUser);
      fastify.delete('/users/:id', deleteUser);
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(5);
  });

  it("should detect fastify.route() full syntax", () => {
    const source = `
      fastify.route({
        method: 'GET',
        url: '/items',
        handler: async (req, reply) => {}
      });
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/items");
  });

  it("should infer body fields from req.body", () => {
    const source = `fastify.post('/users', async (req, reply) => {
      const { name, email } = req.body;
      reply.send({ id: 1 });
    });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].body).toBeDefined();
    expect(endpoints[0].body!.fields).toHaveProperty("name");
    expect(endpoints[0].body!.fields).toHaveProperty("email");
  });

  it("should infer query params from req.query", () => {
    const source = `fastify.get('/search', async (req, reply) => {
      const q = req.query.q;
      const page = req.query.page;
      reply.send([]);
    });`;
    const endpoints = adapter.parse(source, "test.ts");
    const queryParams = endpoints[0].params.filter(p => p.location === "query");
    expect(queryParams).toHaveLength(2);
    expect(queryParams.map(p => p.name)).toContain("q");
    expect(queryParams.map(p => p.name)).toContain("page");
  });

  it("should infer body fields from Fastify schema", () => {
    const source = `fastify.post('/users', {
      schema: {
        body: {
          type: 'object',
          properties: { name: { type: 'string' }, age: { type: 'number' } }
        }
      }
    }, async (req, reply) => {
      reply.send({ id: 1 });
    });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].body).toBeDefined();
    expect(endpoints[0].body!.fields).toHaveProperty("name");
    expect(endpoints[0].body!.fields!.name).toBe("string");
    expect(endpoints[0].body!.fields).toHaveProperty("age");
    expect(endpoints[0].body!.fields!.age).toBe("number");
  });
});
