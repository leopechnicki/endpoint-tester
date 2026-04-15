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
  ];

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
    it("should generate valid jest test file", () => {
      const output = generator.generate({
        endpoints: sampleEndpoints,
        output: "./tests",
        format: "jest",
      });

      expect(output).toContain("describe(");
      expect(output).toContain("it(");
      expect(output).toContain("expect(");
      expect(output).not.toContain("import");
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
      expect(output).toContain("assert response.status_code < 500");
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
