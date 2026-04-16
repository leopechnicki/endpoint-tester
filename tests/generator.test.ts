import { describe, it, expect } from "vitest";
import { TestGenerator } from "../src/generator.js";
import type { Endpoint } from "../src/types.js";

describe("TestGenerator", () => {
  const generator = new TestGenerator();

  const sampleEndpoints: Endpoint[] = [
    { method: "GET", path: "/users", handler: "getUsers", params: [] },
    {
      method: "GET",
      path: "/users/:id",
      handler: "getUserById",
      params: [{ name: "id", location: "path", type: "string", required: true }],
    },
    {
      method: "POST",
      path: "/users",
      handler: "createUser",
      params: [],
      body: { type: "json" },
    },
    {
      method: "DELETE",
      path: "/users/:id",
      handler: "deleteUser",
      params: [{ name: "id", location: "path", type: "string", required: true }],
    },
    {
      method: "PUT",
      path: "/users/:id",
      handler: "updateUser",
      params: [{ name: "id", location: "path", type: "string", required: true }],
      body: { type: "json", fields: { name: "string", email: "string" } },
    },
    {
      method: "PATCH",
      path: "/users/:id",
      handler: "patchUser",
      params: [{ name: "id", location: "path", type: "string", required: true }],
      body: { type: "json" },
    },
  ];

  describe("method-specific status codes", () => {
    it("should expect 200 for GET", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[0]],
        output: "./tests",
        format: "vitest",
      });
      expect(output).toContain("toBe(200)");
    });

    it("should expect 201 for POST", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[2]],
        output: "./tests",
        format: "vitest",
      });
      expect(output).toContain("toBe(201)");
    });

    it("should expect 204 for DELETE", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[3]],
        output: "./tests",
        format: "vitest",
      });
      expect(output).toContain("toBe(204)");
    });

    it("should expect 200 for PUT", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[4]],
        output: "./tests",
        format: "vitest",
      });
      expect(output).toContain("should return 200");
      expect(output).toContain("toBe(200)");
    });

    it("should expect 200 for PATCH", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[5]],
        output: "./tests",
        format: "vitest",
      });
      expect(output).toContain("should return 200");
    });
  });

  describe("boundary value tests", () => {
    it("should generate boundary tests for path params", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[1]],
        output: "./tests",
        format: "vitest",
      });

      // Boundary tests for :id param with different values
      expect(output).toContain("with id=");
      expect(output).toContain("should not 500");
    });

    it("should not generate boundary tests when no path params", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[0]],
        output: "./tests",
        format: "vitest",
      });

      expect(output).not.toContain("boundary");
    });
  });

  describe("auth header tests", () => {
    it("should generate auth header tests", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[0]],
        output: "./tests",
        format: "vitest",
      });

      expect(output).toContain("Authorization");
      expect(output).toContain("Bearer test-token");
      expect(output).toContain("with auth header");
    });
  });

  describe("error response tests", () => {
    it("should generate error test for endpoints with body", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[2]],
        output: "./tests",
        format: "vitest",
      });

      expect(output).toContain("without body should return 400");
      expect(output).toContain("toBeGreaterThanOrEqual(400)");
    });

    it("should not generate error test for GET endpoints", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[0]],
        output: "./tests",
        format: "vitest",
      });

      expect(output).not.toContain("without body");
    });
  });

  describe("sample body generation", () => {
    it("should include field names in sample body when fields defined", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[4]],
        output: "./tests",
        format: "vitest",
      });

      expect(output).toContain("test-name");
      expect(output).toContain("test-email");
    });
  });

  describe("vitest format", () => {
    it("should generate valid vitest test file", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "vitest",
      });

      expect(output).toContain('import { describe, it, expect } from "vitest"');
      expect(output).toContain("BASE_URL");
      expect(output).toContain('method: "GET"');
      expect(output).toContain('method: "POST"');
      expect(output).toContain("/users");
    });

    it("should replace route params with test values", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "vitest",
      });

      expect(output).toContain("test-id");
    });

    it("should include JSON body for POST requests", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "vitest",
      });

      expect(output).toContain("Content-Type");
      expect(output).toContain("JSON.stringify");
    });

    it("should use custom base URL", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "vitest",
        baseUrl: "http://api.example.com",
      });

      expect(output).toContain("http://api.example.com");
    });
  });

  describe("jest format", () => {
    it("should generate valid jest test file without vitest imports", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "jest",
      });

      expect(output).toContain("describe(");
      expect(output).toContain("it(");
      expect(output).toContain("expect(");
      expect(output).not.toContain('import { describe');
    });

    it("should include jest format comment header", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "jest",
      });

      expect(output).toContain("Jest test file");
      expect(output).toContain("globals");
    });

    it("should generate method-specific assertions", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "jest",
      });

      expect(output).toContain("toBe(201)");
      expect(output).toContain("toBe(204)");
      expect(output).toContain("toBe(200)");
    });
  });

  describe("pytest format", () => {
    it("should generate valid pytest test file", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "pytest",
      });

      expect(output).toContain("import requests");
      expect(output).toContain("import pytest");
      expect(output).toContain("def test_");
    });

    it("should generate method-specific status assertions for pytest", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "pytest",
      });

      expect(output).toContain("assert response.status_code == 200");
      expect(output).toContain("assert response.status_code == 201");
      expect(output).toContain("assert response.status_code == 204");
    });

    it("should create valid Python function names", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "pytest",
      });

      expect(output).toContain("def test_get_users():");
      expect(output).toContain("def test_post_users():");
    });

    it("should generate auth header tests for pytest", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "pytest",
      });

      expect(output).toContain("Authorization");
      expect(output).toContain("Bearer test-token");
      expect(output).toContain("with_auth");
    });

    it("should generate error tests for body endpoints in pytest", () => {
      const output = generator.generate({
        endpoints: [sampleEndpoints[2]],
        output: "./tests",
        format: "pytest",
      });

      expect(output).toContain("empty_body");
      expect(output).toContain("400 <= response.status_code < 500");
    });
  });

  describe("getExpectedStatus", () => {
    it("should return correct status for each method", () => {
      expect(generator.getExpectedStatus("GET")).toBe(200);
      expect(generator.getExpectedStatus("POST")).toBe(201);
      expect(generator.getExpectedStatus("PUT")).toBe(200);
      expect(generator.getExpectedStatus("PATCH")).toBe(200);
      expect(generator.getExpectedStatus("DELETE")).toBe(204);
      expect(generator.getExpectedStatus("HEAD")).toBe(200);
      expect(generator.getExpectedStatus("OPTIONS")).toBe(200);
    });
  });

  it("should throw on unsupported format", () => {
    expect(() =>
      generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "unknown" as never,
      }),
    ).toThrow("Unsupported test format");
  });
});
