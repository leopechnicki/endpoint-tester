import { describe, it, expect } from "vitest";
import { ChiAdapter } from "../../src/adapters/chi.js";

describe("ChiAdapter", () => {
  const adapter = new ChiAdapter();

  it("should parse r.Get route", () => {
    const source = `r.Get("/users", listUsers)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("listUsers");
  });

  it("should parse r.Post route", () => {
    const source = `r.Post("/users", createUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should parse route with {param} path parameter and normalize to :param", () => {
    const source = `r.Get("/users/{id}", getUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:id");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("id");
    expect(endpoints[0].params[0].location).toBe("path");
    expect(endpoints[0].params[0].required).toBe(true);
  });

  it("should parse DELETE route", () => {
    const source = `r.Delete("/users/{id}", deleteUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("DELETE");
    expect(endpoints[0].path).toBe("/users/:id");
  });

  it("should parse PUT route", () => {
    const source = `r.Put("/users/{id}", updateUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("PUT");
  });

  it("should parse PATCH route", () => {
    const source = `r.Patch("/users/{id}", patchUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("PATCH");
  });

  it("should parse multiple routes", () => {
    const source = `
r.Get("/users", listUsers)
r.Post("/users", createUser)
r.Get("/users/{id}", getUser)
r.Put("/users/{id}", updateUser)
r.Delete("/users/{id}", deleteUser)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(5);
    expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "GET", "PUT", "DELETE"]);
  });

  it("should include file path and line number", () => {
    const source = `r.Get("/health", healthCheck)`;
    const endpoints = adapter.parse(source, "main.go");

    expect(endpoints[0].file).toBe("main.go");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-Chi code", () => {
    const source = `
func main() {
    fmt.Println("hello")
}
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });

  it("should handle multiple path params", () => {
    const source = `r.Get("/users/{userId}/posts/{postId}", getPost)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:userId/posts/:postId");
    expect(endpoints[0].params).toHaveLength(2);
    expect(endpoints[0].params[0].name).toBe("userId");
    expect(endpoints[0].params[1].name).toBe("postId");
  });
});
