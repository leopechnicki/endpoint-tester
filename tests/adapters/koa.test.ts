import { describe, it, expect } from "vitest";
import { KoaAdapter } from "../../src/adapters/koa.js";

describe("KoaAdapter", () => {
  const adapter = new KoaAdapter();

  it("should detect router.get() route", () => {
    const source = `router.get('/users', async (ctx) => { ctx.body = []; });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should detect router.post() route", () => {
    const source = `router.post('/users', async (ctx) => { ctx.body = { id: 1 }; });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
  });

  it("should extract path parameters", () => {
    const source = `router.get('/users/:id', getUser);`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("id");
    expect(endpoints[0].params[0].location).toBe("path");
  });

  it("should detect multiple routes", () => {
    const source = `
      router.get('/items', listItems);
      router.post('/items', createItem);
      router.get('/items/:id', getItem);
      router.put('/items/:id', updateItem);
      router.delete('/items/:id', deleteItem);
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(5);
  });

  it("should handle router.all()", () => {
    const source = `router.all('/health', healthHandler);`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(7); // all HTTP methods
  });

  it("should detect router prefix via router.prefix()", () => {
    const source = `
      router.prefix('/api');
      router.get('/users', listUsers);
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].path).toBe("/api/users");
  });

  it("should infer body fields from ctx.request.body", () => {
    const source = `router.post('/users', async (ctx) => {
      const { name, email } = ctx.request.body;
      ctx.body = { id: 1, name };
    });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].body).toBeDefined();
    expect(endpoints[0].body!.fields).toHaveProperty("name");
    expect(endpoints[0].body!.fields).toHaveProperty("email");
  });

  it("should infer query params from ctx.query", () => {
    const source = `router.get('/search', async (ctx) => {
      const search = ctx.query.q;
      const limit = ctx.query.limit;
      ctx.body = [];
    });`;
    const endpoints = adapter.parse(source, "test.ts");
    const queryParams = endpoints[0].params.filter(p => p.location === "query");
    expect(queryParams).toHaveLength(2);
    expect(queryParams.map(p => p.name)).toContain("q");
    expect(queryParams.map(p => p.name)).toContain("limit");
  });

  it("should infer response fields from ctx.body assignment", () => {
    const source = `router.get('/users/:id', async (ctx) => {
      ctx.body = { id: 1, name: "test", email: "test@test.com" };
    });`;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].response).toBeDefined();
    expect(endpoints[0].response!.fields).toHaveProperty("id");
    expect(endpoints[0].response!.fields).toHaveProperty("name");
    expect(endpoints[0].response!.fields).toHaveProperty("email");
  });
});
