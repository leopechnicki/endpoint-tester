import { describe, it, expect } from "vitest";
import { TestGenerator } from "../src/generator.js";
import type { Endpoint } from "../src/types.js";

describe("TestGenerator — Go format", () => {
  const generator = new TestGenerator();

  it("generates a valid Go function name for the root path /", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/", handler: "rootHandler", params: [] },
    ];
    const output = generator.generate({
      endpoints,
      output: "endpoint_test.go",
      format: "go",
    });
    expect(output).toContain("func TestGet_Root(t *testing.T)");
    expect(output).not.toMatch(/func TestGet_\(t \*testing\.T\)/);
  });

  it("generates a valid WithAuth function name for root path", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/", handler: "rootHandler", params: [] },
    ];
    const output = generator.generate({
      endpoints,
      output: "endpoint_test.go",
      format: "go",
    });
    expect(output).toContain("func TestGet_Root_WithAuth(t *testing.T)");
  });

  it("generates a standard Go function name for a normal path", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/users", handler: "getUsers", params: [] },
    ];
    const output = generator.generate({
      endpoints,
      output: "endpoint_test.go",
      format: "go",
    });
    expect(output).toContain("func TestGet_users(t *testing.T)");
  });

  it("generates Go tests with correct package declaration and imports", () => {
    const endpoints: Endpoint[] = [
      { method: "POST", path: "/items", handler: "createItem", params: [] },
    ];
    const output = generator.generate({
      endpoints,
      output: "endpoint_test.go",
      format: "go",
    });
    expect(output).toContain("package endpoint_test");
    expect(output).toContain('"net/http"');
    expect(output).toContain('"testing"');
  });

  it("generates consistent func names for different HTTP methods on root path", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/", handler: "getRoot", params: [] },
      { method: "POST", path: "/", handler: "postRoot", params: [] },
    ];
    const output = generator.generate({
      endpoints,
      output: "endpoint_test.go",
      format: "go",
    });
    expect(output).toContain("func TestGet_Root(t *testing.T)");
    expect(output).toContain("func TestPost_Root(t *testing.T)");
  });
});
