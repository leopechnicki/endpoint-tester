import { describe, it, expect } from "vitest";
import { KoaAdapter } from "../../src/adapters/koa.js";

describe("KoaAdapter — edge cases", () => {
  const adapter = new KoaAdapter();

  it("applies router.prefix('/api') to subsequent routes on the same identifier", () => {
    const source = `
      import Router from '@koa/router';
      const router = new Router();
      router.prefix('/api');

      router.get('/users', listUsers);
      router.post('/users', createUser);
    `;

    const endpoints = adapter.parse(source);
    const paths = endpoints.map((e) => e.path).sort();
    expect(paths).toEqual(["/api/users", "/api/users"]);
  });

  it("applies app.use('/prefix', router.routes()) to routes on that router", () => {
    const source = `
      const app = new Koa();
      const userRouter = new Router();
      userRouter.get('/me', handler);
      app.use('/v1', userRouter.routes());
    `;

    const endpoints = adapter.parse(source);
    expect(endpoints[0].path).toBe("/v1/me");
  });

  it("expands router.all('/x', ...) into all 7 HTTP methods", () => {
    const source = `
      router.all('/any', handler);
    `;

    const endpoints = adapter.parse(source);
    const methods = endpoints.map((e) => e.method).sort();
    expect(methods).toEqual([
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]);
    for (const ep of endpoints) {
      expect(ep.path).toBe("/any");
    }
  });

  it("infers query params from both ctx.query.x dot access and destructuring", () => {
    const source = `
      router.get('/search', async (ctx) => {
        const q = ctx.query.q;
        const { page, limit } = ctx.query;
        ctx.body = { results: [] };
      });
    `;

    const endpoint = adapter.parse(source)[0];
    const queryParamNames = endpoint.params
      .filter((p) => p.location === "query")
      .map((p) => p.name)
      .sort();
    expect(queryParamNames).toEqual(["limit", "page", "q"]);
  });

  it("infers body fields from both ctx.request.body.x and ctx.body.x access styles", () => {
    const source = `
      router.post('/items', async (ctx) => {
        const name = ctx.request.body.name;
        const price = ctx.body.price;
        ctx.body = { ok: true };
      });
    `;

    const endpoint = adapter.parse(source)[0];
    expect(endpoint.body?.fields).toEqual({
      name: "string",
      price: "string",
    });
  });

  it("extracts path params from routes with multiple :params", () => {
    const source = `
      router.get('/orgs/:orgId/users/:userId', handler);
    `;

    const endpoint = adapter.parse(source)[0];
    const paramNames = endpoint.params
      .filter((p) => p.location === "path")
      .map((p) => p.name);
    expect(paramNames).toEqual(["orgId", "userId"]);
  });
});
