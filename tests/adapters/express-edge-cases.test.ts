import { describe, it, expect } from "vitest";
import { ExpressAdapter } from "../../src/adapters/express.js";

describe("ExpressAdapter — edge cases", () => {
  const adapter = new ExpressAdapter();

  describe("app.route() chaining", () => {
    it("should parse single-line route chain", () => {
      const source = `app.route('/users').get(getUsers).post(createUser);`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[0].path).toBe("/users");
      expect(endpoints[1].method).toBe("POST");
      expect(endpoints[1].path).toBe("/users");
    });

    it("should parse multi-line route chain", () => {
      const source = `
app.route('/items')
  .get(listItems)
  .post(createItem)
  .put(updateItem);
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "PUT"]);
      expect(endpoints.every((e) => e.path === "/items")).toBe(true);
    });

    it("should parse route chain with path params", () => {
      const source = `app.route('/users/:id').get(getUser).put(updateUser).delete(deleteUser);`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].path).toBe("/users/:id");
      expect(endpoints[0].params).toHaveLength(1);
      expect(endpoints[0].params[0].name).toBe("id");
    });
  });

  describe("router.use() patterns", () => {
    it("should detect router.use prefix (not just app.use)", () => {
      const source = `
const apiRouter = express.Router();
const userRouter = express.Router();
apiRouter.use('/users', userRouter);
userRouter.get('/', listUsers);
userRouter.get('/:id', getUser);
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].path).toBe("/users/");
      expect(endpoints[1].path).toBe("/users/:id");
    });
  });

  describe("complex real-world patterns", () => {
    it("should handle routes with template literals", () => {
      const source = "app.get(`/api/health`, healthCheck);";
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/api/health");
    });

    it("should handle arrow function handlers inline", () => {
      const source = `app.get('/status', (req, res) => res.json({ ok: true }));`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].handler).toBe("<anonymous>");
    });

    it("should handle multiple middlewares before handler", () => {
      const source = `app.post('/admin/action', authMiddleware, validateInput, rateLimiter, performAction);`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("POST");
      expect(endpoints[0].handler).toBe("performAction");
    });

    it("should handle deeply nested path params", () => {
      const source = `app.get('/orgs/:orgId/teams/:teamId/members/:memberId', getMember);`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params).toHaveLength(3);
      expect(endpoints[0].params.map((p) => p.name)).toEqual(["orgId", "teamId", "memberId"]);
    });

    it("should handle multiple router prefixes in same file", () => {
      const source = `
const authRouter = express.Router();
const publicRouter = express.Router();
app.use('/auth', authRouter);
app.use('/public', publicRouter);
authRouter.post('/login', loginHandler);
authRouter.post('/register', registerHandler);
publicRouter.get('/health', healthCheck);
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].path).toBe("/auth/login");
      expect(endpoints[1].path).toBe("/auth/register");
      expect(endpoints[2].path).toBe("/public/health");
    });
  });

  describe("app.all() wildcard", () => {
    it("should expand app.all() to all HTTP methods", () => {
      const source = `app.all('/api/*', corsHandler);`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(7);
      expect(endpoints.map(e => e.method)).toEqual([
        "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"
      ]);
      expect(endpoints.every(e => e.path === "/api/*")).toBe(true);
    });
  });

  describe("regex routes", () => {
    it("should parse regex route patterns", () => {
      const source = `app.get(/^\\/files\\//, serveFiles);`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[0].path).toContain("/files/");
    });

    it("should parse simple regex route", () => {
      const source = `app.get(/\\/health/, healthCheck);`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
    });
  });
});
