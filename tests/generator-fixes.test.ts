import { describe, it, expect } from "vitest";
import { TestGenerator } from "../src/generator.js";
import type { Endpoint } from "../src/types.js";

const generator = new TestGenerator();

describe("TestGenerator — hasBody fix", () => {
  it("should generate body handling for POST even without explicit body field", () => {
    const endpoint: Endpoint = {
      method: "POST",
      path: "/items",
      handler: "createItem",
      params: [],
      // NOTE: no body property set — adapters typically don't set it
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
    });

    expect(output).toContain("Content-Type");
    expect(output).toContain("JSON.stringify");
    expect(output).toContain("without body should return 400");
  });

  it("should generate body handling for PUT without explicit body", () => {
    const endpoint: Endpoint = {
      method: "PUT",
      path: "/items/:id",
      handler: "updateItem",
      params: [{ name: "id", location: "path", type: "string", required: true }],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
    });

    expect(output).toContain("Content-Type");
    expect(output).toContain("without body should return 400");
  });

  it("should generate body handling for PATCH without explicit body", () => {
    const endpoint: Endpoint = {
      method: "PATCH",
      path: "/items/:id",
      handler: "patchItem",
      params: [{ name: "id", location: "path", type: "string", required: true }],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
    });

    expect(output).toContain("Content-Type");
    expect(output).toContain("without body should return 400");
  });

  it("should NOT generate body handling for GET", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/items",
      handler: "listItems",
      params: [],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
    });

    expect(output).not.toContain("Content-Type");
    expect(output).not.toContain("without body");
  });

  it("should NOT generate body handling for DELETE", () => {
    const endpoint: Endpoint = {
      method: "DELETE",
      path: "/items/:id",
      handler: "deleteItem",
      params: [{ name: "id", location: "path", type: "string", required: true }],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
    });

    expect(output).not.toContain("Content-Type");
    expect(output).not.toContain("without body");
  });

  it("should include json={} for POST in pytest format without explicit body", () => {
    const endpoint: Endpoint = {
      method: "POST",
      path: "/items",
      handler: "createItem",
      params: [],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "pytest",
    });

    expect(output).toContain("json={}");
    expect(output).toContain("empty_body");
  });
});

describe("TestGenerator — Python identifier sanitization", () => {
  it("should produce valid Python identifiers for boundary value -1", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/users/:id",
      handler: "getUser",
      params: [{ name: "id", location: "path", type: "id", required: true }],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "pytest",
    });

    // -1 should NOT appear raw in a function name
    expect(output).not.toMatch(/def test_[^(]*-/);
    // Should contain a sanitized version with "neg"
    expect(output).toMatch(/def test_\w+_boundary_\w+_neg1/);
  });

  it("should produce valid Python identifiers for boundary empty string", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/items/:id",
      handler: "getItem",
      params: [{ name: "id", location: "path", type: "string", required: true }],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "pytest",
    });

    // All function names should be valid Python identifiers
    const funcNames = output.match(/def (test_\w+)\(/g) ?? [];
    expect(funcNames.length).toBeGreaterThan(0);
    for (const fn of funcNames) {
      const name = fn.replace("def ", "").replace("(", "");
      expect(name).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
    }
  });
});

describe("TestGenerator — control character escaping in baseUrl", () => {
  it("should escape newlines in baseUrl so generated test file is syntactically valid", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/health",
      handler: "healthCheck",
      params: [],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
      baseUrl: "http://localhost:3000\nmalicious",
    });

    expect(output).toContain("\\n");
    expect(output).not.toMatch(/BASE_URL = "http:\/\/localhost:3000\nmalicious"/);
  });

  it("should escape carriage returns and tabs in baseUrl", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/ping",
      handler: "ping",
      params: [],
    };

    const outputCR = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "vitest",
      baseUrl: "http://localhost\r\n:3000",
    });

    expect(outputCR).toContain("\\r");
    expect(outputCR).toContain("\\n");
  });

  it("should escape newlines in pytest BASE_URL assignment", () => {
    const endpoint: Endpoint = {
      method: "GET",
      path: "/health",
      handler: "healthCheck",
      params: [],
    };

    const output = generator.generate({
      endpoints: [endpoint],
      output: "./tests",
      format: "pytest",
      baseUrl: "http://localhost:3000\ninjected",
    });

    expect(output).toContain("\\n");
  });
});
