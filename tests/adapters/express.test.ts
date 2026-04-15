import { describe, it, expect } from "vitest";
import { ExpressAdapter } from "../../src/adapters/express.js";

describe("ExpressAdapter", () => {
  const adapter = new ExpressAdapter();

  it("should parse app.get route", () => {
    const source = `app.get('/users', getUsers);`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("getUsers");
  });

  it("should parse app.post route", () => {
    const source = `app.post('/users', createUser);`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should parse router.get route", () => {
    const source = `router.get('/items', listItems);`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/items");
  });

  it("should parse route parameters", () => {
    const source = `app.get('/users/:id', getUserById);`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:id");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("id");
    expect(endpoints[0].params[0].location).toBe("path");
    expect(endpoints[0].params[0].required).toBe(true);
  });

  it("should parse multiple route parameters", () => {
    const source = `app.get('/users/:userId/posts/:postId', getPost);`;
    const endpoints = adapter.parse(source);

    expect(endpoints[0].params).toHaveLength(2);
    expect(endpoints[0].params[0].name).toBe("userId");
    expect(endpoints[0].params[1].name).toBe("postId");
  });

  it("should handle middleware in route definition", () => {
    const source = `app.post('/admin/users', authMiddleware, createUser);`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/admin/users");
    expect(endpoints[0].handler).toBe("createUser");
  });

  it("should parse multiple routes", () => {
    const source = `
      app.get('/users', getUsers);
      app.post('/users', createUser);
      app.get('/users/:id', getUserById);
      app.put('/users/:id', updateUser);
      app.delete('/users/:id', deleteUser);
    `;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(5);
    expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "GET", "PUT", "DELETE"]);
  });

  it("should detect nested router prefixes", () => {
    const source = `
      const userRouter = express.Router();
      app.use('/api/users', userRouter);
      userRouter.get('/', listUsers);
      userRouter.get('/:id', getUser);
    `;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].path).toBe("/api/users/");
    expect(endpoints[1].path).toBe("/api/users/:id");
  });

  it("should include file path and line number", () => {
    const source = `app.get('/health', healthCheck);`;
    const endpoints = adapter.parse(source, "src/routes.ts");

    expect(endpoints[0].file).toBe("src/routes.ts");
    expect(endpoints[0].line).toBe(1);
  });

  it("should handle all HTTP methods", () => {
    const source = `
      app.get('/a', h);
      app.post('/b', h);
      app.put('/c', h);
      app.delete('/d', h);
      app.patch('/e', h);
    `;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(5);
    expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "PUT", "DELETE", "PATCH"]);
  });

  it("should return empty array for non-Express code", () => {
    const source = `
      const x = 42;
      console.log("hello world");
    `;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });
});
