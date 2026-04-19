import { describe, it, expect } from "vitest";
import { TestGenerator } from "../src/generator.js";
import type { Endpoint } from "../src/types.js";

describe("TestGenerator v0.3 features", () => {
  const generator = new TestGenerator();

  const endpointWithBodyFields: Endpoint = {
    method: "POST",
    path: "/users",
    handler: "createUser",
    params: [],
    body: {
      type: "object",
      fields: { name: "string", email: "string", age: "number" },
    },
  };

  const endpointWithQueryParams: Endpoint = {
    method: "GET",
    path: "/search",
    handler: "search",
    params: [
      { name: "q", location: "query", type: "string", required: true },
      { name: "page", location: "query", type: "number" },
    ],
  };

  const endpointWithResponseFields: Endpoint = {
    method: "GET",
    path: "/users/:id",
    handler: "getUser",
    params: [{ name: "id", location: "path", type: "string", required: true }],
    response: {
      fields: { id: "number", name: "string", email: "string" },
    },
  };

  const endpointWithArrayResponse: Endpoint = {
    method: "GET",
    path: "/users",
    handler: "listUsers",
    params: [],
    response: {
      fields: { id: "number", name: "string" },
      isArray: true,
    },
  };

  describe("response schema validation", () => {
    it("should generate content-type validation test (vitest)", () => {
      const output = generator.generate({
        endpoints: [endpointWithResponseFields],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("should return valid JSON response");
      expect(output).toContain('toContain("application/json")');
      expect(output).toContain("not.toBeNull()");
    });

    it("should check response fields when known", () => {
      const output = generator.generate({
        endpoints: [endpointWithResponseFields],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain('toHaveProperty("id")');
      expect(output).toContain('toHaveProperty("name")');
      expect(output).toContain('toHaveProperty("email")');
    });

    it("should check array response structure", () => {
      const output = generator.generate({
        endpoints: [endpointWithArrayResponse],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("Array.isArray(data)");
      expect(output).toContain("data[0]");
    });

    it("should not generate schema test for DELETE", () => {
      const deleteEndpoint: Endpoint = {
        method: "DELETE",
        path: "/users/:id",
        handler: "deleteUser",
        params: [{ name: "id", location: "path", type: "string", required: true }],
      };
      const output = generator.generate({
        endpoints: [deleteEndpoint],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).not.toContain("should return valid JSON response");
    });

    it("should generate pytest schema validation", () => {
      const output = generator.generate({
        endpoints: [endpointWithResponseFields],
        output: "test.py",
        format: "pytest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("response_schema");
      expect(output).toContain("application/json");
      expect(output).toContain("response.json()");
    });
  });

  describe("smart body inference tests", () => {
    it("should generate missing field tests (vitest)", () => {
      const output = generator.generate({
        endpoints: [endpointWithBodyFields],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("without 'name' should return 4xx");
      expect(output).toContain("without 'email' should return 4xx");
      expect(output).toContain("without 'age' should return 4xx");
    });

    it("should generate wrong type tests (vitest)", () => {
      const output = generator.generate({
        endpoints: [endpointWithBodyFields],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("wrong type for 'name'");
      expect(output).toContain("wrong type for 'age'");
    });

    it("should use correct sample values in body", () => {
      const output = generator.generate({
        endpoints: [endpointWithBodyFields],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain('"test-name"');
      expect(output).toContain('"test-email"');
    });

    it("should generate pytest missing field tests", () => {
      const output = generator.generate({
        endpoints: [endpointWithBodyFields],
        output: "test.py",
        format: "pytest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("missing_name");
      expect(output).toContain("missing_email");
      expect(output).toContain("wrong_type_age");
    });
  });

  describe("query parameter tests", () => {
    it("should generate query param test (vitest)", () => {
      const output = generator.generate({
        endpoints: [endpointWithQueryParams],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("with query params should not 500");
      expect(output).toContain("q=test");
      expect(output).toContain("page=test");
    });

    it("should test missing required query params", () => {
      const output = generator.generate({
        endpoints: [endpointWithQueryParams],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("without required query param 'q'");
    });

    it("should generate boundary query param values", () => {
      const output = generator.generate({
        endpoints: [endpointWithQueryParams],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      // String params get boundary values
      expect(output).toContain("q=");
    });

    it("should generate pytest query param tests", () => {
      const output = generator.generate({
        endpoints: [endpointWithQueryParams],
        output: "test.py",
        format: "pytest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("with_query_params");
      expect(output).toContain("q=test");
    });
  });

  describe("enhanced auth tests", () => {
    it("should generate three auth tests per endpoint (vitest)", () => {
      const simpleEndpoint: Endpoint = {
        method: "GET",
        path: "/protected",
        handler: "protectedRoute",
        params: [],
      };
      const output = generator.generate({
        endpoints: [simpleEndpoint],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("with auth header should not 500");
      expect(output).toContain("without auth should not 500");
      expect(output).toContain("with invalid auth should not 500");
    });

    it("should test malformed auth token", () => {
      const ep: Endpoint = { method: "GET", path: "/test", handler: "h", params: [] };
      const output = generator.generate({
        endpoints: [ep],
        output: "test.ts",
        format: "vitest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("InvalidTokenFormat");
    });

    it("should generate three pytest auth tests", () => {
      const ep: Endpoint = { method: "GET", path: "/test", handler: "h", params: [] };
      const output = generator.generate({
        endpoints: [ep],
        output: "test.py",
        format: "pytest",
        baseUrl: "http://localhost:3000",
      });
      expect(output).toContain("with_auth");
      expect(output).toContain("without_auth");
      expect(output).toContain("invalid_auth");
      expect(output).toContain("InvalidTokenFormat");
    });
  });
});
