import type { Endpoint, GenerateOptions, HttpMethod } from "./types.js";

/**
 * Map of HTTP methods to their expected success status codes.
 */
const METHOD_STATUS_MAP: Record<HttpMethod, number> = {
  GET: 200,
  POST: 201,
  PUT: 200,
  PATCH: 200,
  DELETE: 204,
  HEAD: 200,
  OPTIONS: 200,
};

/**
 * Sample boundary values for common parameter types.
 */
const BOUNDARY_VALUES: Record<string, string[]> = {
  string: ['""', '"a"', '"' + "x".repeat(256) + '"'],
  number: ["0", "-1", "999999999"],
  integer: ["0", "-1", "999999999"],
  id: ['"0"', '"-1"', '"nonexistent"'],
};

/**
 * Escape a value for safe embedding inside a double-quoted string literal.
 * Handles backslashes, double quotes, and backticks.
 */
function escapeForStringLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`");
}

export class TestGenerator {
  /**
   * Generate test file content for the given endpoints.
   */
  generate(options: GenerateOptions): string {
    switch (options.format) {
      case "vitest":
        return this.generateVitest(options.endpoints, options.baseUrl);
      case "jest":
        return this.generateJest(options.endpoints, options.baseUrl);
      case "pytest":
        return this.generatePytest(options.endpoints, options.baseUrl);
      case "go":
        return this.generateGo(options.endpoints);
      default:
        throw new Error(`Unsupported test format: ${options.format}`);
    }
  }

  /**
   * Get the expected success status code for an HTTP method.
   */
  getExpectedStatus(method: HttpMethod): number {
    return METHOD_STATUS_MAP[method] ?? 200;
  }

  private generateVitest(endpoints: Endpoint[], baseUrl = "http://localhost:3000"): string {
    const lines: string[] = [
      `import { describe, it, expect } from "vitest";`,
      ``,
      `const BASE_URL = "${escapeForStringLiteral(baseUrl)}";`,
      ``,
    ];

    const groups = this.groupByPrefix(endpoints);

    for (const [group, eps] of Object.entries(groups)) {
      lines.push(`describe("${group}", () => {`);

      for (const ep of eps) {
        // Main success test
        this.appendTsSuccessTest(lines, ep);

        // Error response test (missing required body)
        if (this.hasBody(ep)) {
          this.appendTsErrorTest(lines, ep);
        }

        // Boundary value tests for path params
        this.appendTsBoundaryTests(lines, ep);

        // Auth header test
        this.appendTsAuthTest(lines, ep);
      }

      lines.push(`});`);
      lines.push(``);
    }

    return lines.join("\n");
  }

  private generateJest(endpoints: Endpoint[], baseUrl = "http://localhost:3000"): string {
    const lines: string[] = [
      `// Jest test file — uses global describe/it/expect (no imports needed).`,
      `// Both Jest and Vitest generate .ts files; Jest relies on globals while`,
      `// Vitest uses explicit imports. See README for configuration details.`,
      ``,
      `const BASE_URL = "${escapeForStringLiteral(baseUrl)}";`,
      ``,
    ];

    const groups = this.groupByPrefix(endpoints);

    for (const [group, eps] of Object.entries(groups)) {
      lines.push(`describe("${group}", () => {`);

      for (const ep of eps) {
        this.appendTsSuccessTest(lines, ep);

        if (this.hasBody(ep)) {
          this.appendTsErrorTest(lines, ep);
        }

        this.appendTsBoundaryTests(lines, ep);
        this.appendTsAuthTest(lines, ep);
      }

      lines.push(`});`);
      lines.push(``);
    }

    return lines.join("\n");
  }

  private generatePytest(endpoints: Endpoint[], baseUrl = "http://localhost:3000"): string {
    const lines: string[] = [
      `import requests`,
      `import pytest`,
      ``,
      `BASE_URL = "${escapeForStringLiteral(baseUrl)}"`,
      ``,
    ];

    for (const ep of endpoints) {
      const testPath = this.buildTestPath(ep);
      const funcName = this.toPythonFuncName(ep);
      const expectedStatus = this.getExpectedStatus(ep.method);
      const safeMethod = escapeForStringLiteral(ep.method);
      const safePath = escapeForStringLiteral(ep.path);
      const safeTestPath = escapeForStringLiteral(testPath);

      // Main success test
      lines.push(`def ${funcName}():`);
      lines.push(`    """Test ${safeMethod} ${safePath}"""`);

      if (this.hasBody(ep)) {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}", json={})`);
      } else {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}")`);
      }
      lines.push(`    assert response.status_code == ${expectedStatus}`);
      lines.push(``);

      // Error test for body endpoints
      if (this.hasBody(ep)) {
        lines.push(`def ${funcName}_empty_body():`);
        lines.push(`    """Test ${safeMethod} ${safePath} with empty body returns 4xx"""`);
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}")`);
        lines.push(`    assert 400 <= response.status_code < 500`);
        lines.push(``);
      }

      // Auth header test
      lines.push(`def ${funcName}_with_auth():`);
      lines.push(`    """Test ${safeMethod} ${safePath} with Authorization header"""`);
      if (this.hasBody(ep)) {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(`);
        lines.push(`        f"{BASE_URL}${safeTestPath}",`);
        lines.push(`        json={},`);
        lines.push(`        headers={"Authorization": "Bearer test-token"},`);
        lines.push(`    )`);
      } else {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(`);
        lines.push(`        f"{BASE_URL}${safeTestPath}",`);
        lines.push(`        headers={"Authorization": "Bearer test-token"},`);
        lines.push(`    )`);
      }
      lines.push(`    assert response.status_code < 500`);
      lines.push(``);

      // Boundary tests for path params
      for (const param of ep.params.filter((p) => p.location === "path")) {
        const paramType = param.type ?? "id";
        const values = BOUNDARY_VALUES[paramType] ?? BOUNDARY_VALUES["id"];
        for (const val of values) {
          const cleanVal = val.replace(/"/g, "");
          const boundaryPath = ep.path.replace(`:${param.name}`, cleanVal);
          const safeBoundaryPath = escapeForStringLiteral(boundaryPath);
          const safeParamName = escapeForStringLiteral(param.name);
          const safeCleanVal = escapeForStringLiteral(cleanVal);
          const safeName = this.sanitizePythonName(`${funcName}_boundary_${param.name}_${cleanVal}`);
          lines.push(`def ${safeName}():`);
          lines.push(`    """Test ${safeMethod} ${safePath} with boundary ${safeParamName}=${safeCleanVal}"""`);
          lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeBoundaryPath}")`);
          lines.push(`    assert response.status_code < 500`);
          lines.push(``);
        }
      }
    }

    return lines.join("\n");
  }

  private generateGo(endpoints: Endpoint[]): string {
    const lines: string[] = [
      `package endpoint_test`,
      ``,
      `import (`,
      `\t"net/http"`,
      `\t"net/http/httptest"`,
      `\t"testing"`,
      `)`,
      ``,
    ];

    for (const ep of endpoints) {
      const testPath = this.buildGoTestPath(ep);
      const funcName = this.toGoFuncName(ep);
      const expectedStatus = this.getExpectedStatus(ep.method);
      const httpMethod = `http.Method${this.toGoMethodName(ep.method)}`;

      // Main success test
      lines.push(`func ${funcName}(t *testing.T) {`);
      lines.push(`\treq := httptest.NewRequest(${httpMethod}, "${testPath}", nil)`);
      lines.push(`\tw := httptest.NewRecorder()`);
      lines.push(`\t// TODO: wire your router here, e.g.: router.ServeHTTP(w, req)`);
      lines.push(`\tif w.Code != ${expectedStatus} {`);
      lines.push(`\t\tt.Errorf("expected ${expectedStatus}, got %d", w.Code)`);
      lines.push(`\t}`);
      lines.push(`}`);
      lines.push(``);

      // Auth header test
      lines.push(`func ${funcName}_WithAuth(t *testing.T) {`);
      lines.push(`\treq := httptest.NewRequest(${httpMethod}, "${testPath}", nil)`);
      lines.push(`\treq.Header.Set("Authorization", "Bearer test-token")`);
      lines.push(`\tw := httptest.NewRecorder()`);
      lines.push(`\t// TODO: wire your router here, e.g.: router.ServeHTTP(w, req)`);
      lines.push(`\tif w.Code >= 500 {`);
      lines.push(`\t\tt.Errorf("expected non-5xx, got %d", w.Code)`);
      lines.push(`\t}`);
      lines.push(`}`);
      lines.push(``);
    }

    return lines.join("\n");
  }

  private buildGoTestPath(ep: Endpoint): string {
    // Replace :param with a test value
    return ep.path.replace(/:(\w+)/g, "test-$1");
  }

  private toGoFuncName(ep: Endpoint): string {
    const pathPart = ep.path
      .replace(/[/:{}]/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
    const methodPart = ep.method.charAt(0).toUpperCase() + ep.method.slice(1).toLowerCase();
    return `Test${methodPart}_${pathPart}`;
  }

  private toGoMethodName(method: HttpMethod): string {
    // http.MethodGet, http.MethodPost, etc.
    return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  }

  // --- TypeScript test helpers (shared by Vitest and Jest) ---

  private appendTsSuccessTest(lines: string[], ep: Endpoint): void {
    const testPath = this.buildTestPath(ep);
    const expectedStatus = this.getExpectedStatus(ep.method);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);

    lines.push(`  it("${safeMethod} ${safePath} should return ${expectedStatus}", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
    lines.push(`      method: "${safeMethod}",`);

    if (this.hasBody(ep)) {
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify(${this.buildSampleBody(ep)}),`);
    }

    lines.push(`    });`);
    lines.push(``);
    lines.push(`    expect(response.status).toBe(${expectedStatus});`);
    lines.push(`  });`);
    lines.push(``);
  }

  private appendTsErrorTest(lines: string[], ep: Endpoint): void {
    const testPath = this.buildTestPath(ep);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);

    lines.push(`  it("${safeMethod} ${safePath} without body should return 400", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
    lines.push(`      method: "${safeMethod}",`);
    lines.push(`    });`);
    lines.push(``);
    lines.push(`    expect(response.status).toBeGreaterThanOrEqual(400);`);
    lines.push(`    expect(response.status).toBeLessThan(500);`);
    lines.push(`  });`);
    lines.push(``);
  }

  private appendTsBoundaryTests(lines: string[], ep: Endpoint): void {
    const pathParams = ep.params.filter((p) => p.location === "path");
    if (pathParams.length === 0) return;

    for (const param of pathParams) {
      const paramType = param.type ?? "id";
      const values = BOUNDARY_VALUES[paramType] ?? BOUNDARY_VALUES["id"];

      for (const val of values) {
        const cleanVal = val.replace(/"/g, "");
        const boundaryPath = ep.path.replace(`:${param.name}`, cleanVal);
        const safeMethod = escapeForStringLiteral(ep.method);
        const safePath = escapeForStringLiteral(ep.path);
        const safeBoundaryPath = escapeForStringLiteral(boundaryPath);
        const safeParamName = escapeForStringLiteral(param.name);
        const safeCleanVal = escapeForStringLiteral(cleanVal);

        lines.push(`  it("${safeMethod} ${safePath} with ${safeParamName}=${safeCleanVal} should not 500", async () => {`);
        lines.push(`    const response = await fetch(\`\${BASE_URL}${safeBoundaryPath}\`, {`);
        lines.push(`      method: "${safeMethod}",`);
        lines.push(`    });`);
        lines.push(``);
        lines.push(`    expect(response.status).toBeLessThan(500);`);
        lines.push(`  });`);
        lines.push(``);
      }
    }
  }

  private appendTsAuthTest(lines: string[], ep: Endpoint): void {
    const testPath = this.buildTestPath(ep);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);

    lines.push(`  it("${safeMethod} ${safePath} with auth header should not 500", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
    lines.push(`      method: "${safeMethod}",`);

    if (this.hasBody(ep)) {
      lines.push(`      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-token" },`);
      lines.push(`      body: JSON.stringify(${this.buildSampleBody(ep)}),`);
    } else {
      lines.push(`      headers: { "Authorization": "Bearer test-token" },`);
    }

    lines.push(`    });`);
    lines.push(``);
    lines.push(`    expect(response.status).toBeLessThan(500);`);
    lines.push(`  });`);
    lines.push(``);
  }

  // --- Utility methods ---

  private hasBody(ep: Endpoint): boolean {
    return !!ep.body && (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH");
  }

  private buildSampleBody(ep: Endpoint): string {
    if (ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
      const entries = Object.entries(ep.body.fields).map(([key, type]) => {
        const safeKey = escapeForStringLiteral(key);
        const sampleValue = type === "number" || type === "integer" ? "1" : `"test-${safeKey}"`;
        return `"${safeKey}": ${sampleValue}`;
      });
      return `{ ${entries.join(", ")} }`;
    }
    return "{}";
  }

  private buildTestPath(ep: Endpoint): string {
    return ep.path.replace(/:(\w+)/g, "test-$1");
  }

  private groupByPrefix(endpoints: Endpoint[]): Record<string, Endpoint[]> {
    const groups: Record<string, Endpoint[]> = {};

    for (const ep of endpoints) {
      const parts = ep.path.split("/").filter(Boolean);
      const prefix = parts.length > 0 ? `/${parts[0]}` : "/";
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(ep);
    }

    return groups;
  }

  private toPythonFuncName(ep: Endpoint): string {
    const pathPart = ep.path
      .replace(/[/:]/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
    return `test_${ep.method.toLowerCase()}_${pathPart}`;
  }

  private sanitizePythonName(name: string): string {
    const sanitized = name
      .replace(/-/g, "neg")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "_$1");
    // Ensure pytest discovers the function by requiring a test_ prefix
    return sanitized.startsWith("test_") ? sanitized : `test_${sanitized}`;
  }
}
