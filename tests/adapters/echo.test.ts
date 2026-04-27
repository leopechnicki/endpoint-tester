import { describe, it, expect } from "vitest";
import { EchoAdapter } from "../../src/adapters/echo.js";

describe("EchoAdapter", () => {
  const adapter = new EchoAdapter();

  it("should parse e.GET route", () => {
    const source = `e.GET("/users", getUsers)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("getUsers");
  });

  it("should parse e.POST route", () => {
    const source = `e.POST("/users", createUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should parse route with path parameter", () => {
    const source = `e.GET("/users/:id", getUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:id");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("id");
    expect(endpoints[0].params[0].location).toBe("path");
    expect(endpoints[0].params[0].required).toBe(true);
  });

  it("should parse group prefix routes", () => {
    const source = `
g := e.Group("/api")
g.GET("/users", listUsers)
g.POST("/users", createUser)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].path).toBe("/api/users");
    expect(endpoints[1].path).toBe("/api/users");
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[1].method).toBe("POST");
  });

  it("should parse DELETE route", () => {
    const source = `e.DELETE("/users/:id", deleteUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("DELETE");
  });

  it("should parse multiple routes", () => {
    const source = `
e.GET("/users", listUsers)
e.POST("/users", createUser)
e.GET("/users/:id", getUser)
e.PUT("/users/:id", updateUser)
e.DELETE("/users/:id", deleteUser)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(5);
    expect(endpoints.map((ep) => ep.method)).toEqual(["GET", "POST", "GET", "PUT", "DELETE"]);
  });

  it("should include file path and line number", () => {
    const source = `e.GET("/health", healthCheck)`;
    const endpoints = adapter.parse(source, "main.go");

    expect(endpoints[0].file).toBe("main.go");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-Echo code", () => {
    const source = `
func main() {
    fmt.Println("hello")
}
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });
});
