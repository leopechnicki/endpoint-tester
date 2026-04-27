import { describe, it, expect } from "vitest";
import { GinAdapter } from "../../src/adapters/gin.js";

describe("GinAdapter", () => {
  const adapter = new GinAdapter();

  it("should parse r.GET route", () => {
    const source = `r.GET("/users", GetUsers)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("GetUsers");
  });

  it("should parse router.POST route", () => {
    const source = `router.POST("/users", CreateUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("CreateUser");
  });

  it("should parse route with path parameter", () => {
    const source = `router.GET("/users/:id", GetUser)`;
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
v1 := r.Group("/api/v1")
v1.GET("/users", ListUsers)
v1.POST("/users", CreateUser)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].path).toBe("/api/v1/users");
    expect(endpoints[1].path).toBe("/api/v1/users");
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[1].method).toBe("POST");
  });

  it("should parse DELETE route", () => {
    const source = `r.DELETE("/users/:id", DeleteUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("DELETE");
    expect(endpoints[0].path).toBe("/users/:id");
  });

  it("should parse PUT route", () => {
    const source = `r.PUT("/users/:id", UpdateUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("PUT");
  });

  it("should parse PATCH route", () => {
    const source = `r.PATCH("/users/:id", PatchUser)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("PATCH");
  });

  it("should parse multiple routes", () => {
    const source = `
r.GET("/users", ListUsers)
r.POST("/users", CreateUser)
r.GET("/users/:id", GetUser)
r.PUT("/users/:id", UpdateUser)
r.DELETE("/users/:id", DeleteUser)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(5);
    expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "GET", "PUT", "DELETE"]);
  });

  it("should include file path and line number", () => {
    const source = `r.GET("/health", HealthCheck)`;
    const endpoints = adapter.parse(source, "main.go");

    expect(endpoints[0].file).toBe("main.go");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-Gin code", () => {
    const source = `
func main() {
    fmt.Println("hello")
}
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });

  it("should parse nested group prefixes with assignment", () => {
    const source = `
api := r.Group("/api")
api.GET("/health", HealthCheck)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/health");
  });
});
