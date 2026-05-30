import { describe, it, expect } from "vitest";
import { HonoAdapter } from "../src/adapters/hono.js";

describe("HonoAdapter", () => {
  const adapter = new HonoAdapter();

  it("has correct framework identifier", () => {
    expect(adapter.framework).toBe("hono");
  });

  it("handles .ts, .js, .mjs, .tsx file extensions", () => {
    expect(adapter.fileExtensions).toContain(".ts");
    expect(adapter.fileExtensions).toContain(".js");
    expect(adapter.fileExtensions).toContain(".tsx");
    expect(adapter.fileExtensions).toContain(".mjs");
  });

  describe("basic route parsing", () => {
    it("parses app.get()", () => {
      const source = `
const app = new Hono()
app.get('/health', (c) => c.json({ ok: true }))
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[0].path).toBe("/health");
    });

    it("parses app.post()", () => {
      const source = `
const app = new Hono()
app.post('/users', createUser)
`;
      const endpoints = adapter.parse(source);
      expect(endpoints[0].method).toBe("POST");
      expect(endpoints[0].path).toBe("/users");
    });

    it("parses multiple HTTP methods", () => {
      const source = `
const app = new Hono()
app.get('/items', listItems)
app.post('/items', createItem)
app.put('/items/:id', updateItem)
app.delete('/items/:id', deleteItem)
app.patch('/items/:id', patchItem)
`;
      const endpoints = adapter.parse(source);
      const methods = endpoints.map((e) => e.method);
      expect(methods).toContain("GET");
      expect(methods).toContain("POST");
      expect(methods).toContain("PUT");
      expect(methods).toContain("DELETE");
      expect(methods).toContain("PATCH");
    });

    it("parses path parameters", () => {
      const source = `
const app = new Hono()
app.get('/users/:userId/posts/:postId', getPost)
`;
      const endpoints = adapter.parse(source);
      expect(endpoints[0].params).toHaveLength(2);
      expect(endpoints[0].params[0].name).toBe("userId");
      expect(endpoints[0].params[1].name).toBe("postId");
      expect(endpoints[0].params[0].location).toBe("path");
    });
  });

  describe("Hono variable detection", () => {
    it("detects custom variable names for Hono instances", () => {
      const source = `
const router = new Hono()
router.get('/api/v1/status', statusHandler)
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/api/v1/status");
    });

    it("detects typed Hono instances: new Hono<Env>()", () => {
      const source = `
const api = new Hono<{ Bindings: Env }>()
api.get('/ping', (c) => c.text('pong'))
`;
      const endpoints = adapter.parse(source);
      expect(endpoints.some((e) => e.path === "/ping")).toBe(true);
    });
  });

  describe("sub-app mounting via .use()", () => {
    it("resolves prefix from app.use('/prefix', subApp)", () => {
      const source = `
const app = new Hono()
const v1 = new Hono()
v1.get('/users', listUsers)
app.use('/api/v1', v1)
`;
      const endpoints = adapter.parse(source);
      const apiEndpoint = endpoints.find((e) => e.path.includes("users"));
      expect(apiEndpoint).toBeDefined();
      expect(apiEndpoint!.path).toBe("/api/v1/users");
    });

    it("resolves prefix from app.route('/prefix', subApp)", () => {
      const source = `
const app = new Hono()
const books = new Hono()
books.get('/', listBooks)
books.post('/', createBook)
app.route('/books', books)
`;
      const endpoints = adapter.parse(source);
      const bookEndpoints = endpoints.filter((e) => e.path.includes("books"));
      expect(bookEndpoints.length).toBeGreaterThan(0);
    });
  });

  describe("middleware and multi-arg patterns", () => {
    it("handles app.get with middleware arguments", () => {
      const source = `
const app = new Hono()
app.get('/protected', authMiddleware, getProtected)
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
    });
  });

  describe("ignores non-route lines", () => {
    it("ignores comment lines", () => {
      const source = `
const app = new Hono()
// app.get('/commented-out', handler)
app.get('/real', handler)
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/real");
    });
  });
});
