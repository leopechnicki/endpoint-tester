import type { Endpoint, GenerateOptions, HttpMethod } from "./types.js";
import { SUPPORTED_FORMATS, type SupportedFormat } from "./types.js";

export { SUPPORTED_FORMATS, type SupportedFormat };

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
 * Sample query parameter values for testing.
 */
const QUERY_PARAM_VALUES: Record<string, string[]> = {
  string: ["test", "", "x".repeat(256)],
  number: ["1", "0", "-1", "999999999"],
  integer: ["1", "0", "-1"],
  boolean: ["true", "false", "1", "0"],
  id: ["1", "0", "nonexistent"],
};

/**
 * Escape a value for safe embedding inside a double-quoted string literal.
 * Handles backslashes, double quotes, and backticks.
 */
function escapeForStringLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
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

        // Response schema validation test
        this.appendTsResponseSchemaTest(lines, ep);

        // Error response test (missing required body)
        if (this.hasBody(ep)) {
          this.appendTsErrorTest(lines, ep);
        }

        // Smart body tests (with inferred fields)
        if (this.hasBody(ep) && ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
          this.appendTsSmartBodyTests(lines, ep);
        }

        // Query parameter tests
        this.appendTsQueryParamTests(lines, ep);

        // Boundary value tests for path params
        this.appendTsBoundaryTests(lines, ep);

        // Enhanced auth tests
        this.appendTsAuthTests(lines, ep);
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
        this.appendTsResponseSchemaTest(lines, ep);

        if (this.hasBody(ep)) {
          this.appendTsErrorTest(lines, ep);
        }

        if (this.hasBody(ep) && ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
          this.appendTsSmartBodyTests(lines, ep);
        }

        this.appendTsQueryParamTests(lines, ep);
        this.appendTsBoundaryTests(lines, ep);
        this.appendTsAuthTests(lines, ep);
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
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}", json=${this.buildPythonBody(ep)})`);
      } else {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}")`);
      }
      lines.push(`    assert response.status_code == ${expectedStatus}`);
      lines.push(``);

      // Response schema validation
      if (ep.method !== "DELETE" && ep.method !== "HEAD" && ep.method !== "OPTIONS") {
        lines.push(`def ${funcName}_response_schema():`);
        lines.push(`    """Test ${safeMethod} ${safePath} returns valid JSON with correct content type"""`);
        if (this.hasBody(ep)) {
          lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}", json=${this.buildPythonBody(ep)})`);
        } else {
          lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}")`);
        }
        lines.push(`    assert "application/json" in response.headers.get("Content-Type", "")`);
        lines.push(`    data = response.json()`);
        lines.push(`    assert data is not None`);
        if (ep.response?.fields) {
          const fields = Object.keys(ep.response.fields);
          if (ep.response.isArray) {
            lines.push(`    assert isinstance(data, list)`);
            lines.push(`    if len(data) > 0:`);
            for (const field of fields) {
              lines.push(`        assert "${escapeForStringLiteral(field)}" in data[0]`);
            }
          } else {
            for (const field of fields) {
              lines.push(`    assert "${escapeForStringLiteral(field)}" in data`);
            }
          }
        }
        lines.push(``);
      }

      // Error test for body endpoints
      if (this.hasBody(ep)) {
        lines.push(`def ${funcName}_empty_body():`);
        lines.push(`    """Test ${safeMethod} ${safePath} with empty body returns 4xx"""`);
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}")`);
        lines.push(`    assert 400 <= response.status_code < 500`);
        lines.push(``);
      }

      // Smart body tests (individual field validation)
      if (this.hasBody(ep) && ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
        const fields = Object.entries(ep.body.fields);
        for (const [fieldName, fieldType] of fields) {
          const safeName = this.sanitizePythonName(`${funcName}_missing_${fieldName}`);
          const safeFieldName = escapeForStringLiteral(fieldName);
          lines.push(`def ${safeName}():`);
          lines.push(`    """Test ${safeMethod} ${safePath} with missing required field '${safeFieldName}'"""`);
          const bodyWithout = this.buildPythonBodyWithout(ep, fieldName);
          lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}", json=${bodyWithout})`);
          lines.push(`    assert 400 <= response.status_code < 500`);
          lines.push(``);

          // Wrong type test
          const wrongVal = fieldType === "number" || fieldType === "integer" ? '"not_a_number"' : "12345";
          const wrongName = this.sanitizePythonName(`${funcName}_wrong_type_${fieldName}`);
          lines.push(`def ${wrongName}():`);
          lines.push(`    """Test ${safeMethod} ${safePath} with wrong type for '${safeFieldName}'"""`);
          const bodyWrong = this.buildPythonBodyWithWrongType(ep, fieldName, wrongVal);
          lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}", json=${bodyWrong})`);
          lines.push(`    assert response.status_code < 500`);
          lines.push(``);
        }
      }

      // Query parameter tests
      const queryParams = ep.params.filter((p) => p.location === "query");
      if (queryParams.length > 0) {
        const paramStr = queryParams.map(p => `${p.name}=test`).join("&");
        lines.push(`def ${funcName}_with_query_params():`);
        lines.push(`    """Test ${safeMethod} ${safePath} with query parameters"""`);
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}?${escapeForStringLiteral(paramStr)}")`);
        lines.push(`    assert response.status_code < 500`);
        lines.push(``);

        // Missing required query params
        for (const param of queryParams.filter(p => p.required)) {
          const safeName = this.sanitizePythonName(`${funcName}_missing_query_${param.name}`);
          lines.push(`def ${safeName}():`);
          lines.push(`    """Test ${safeMethod} ${safePath} without required query param '${escapeForStringLiteral(param.name)}'"""`);
          const otherParams = queryParams.filter(p => p.name !== param.name).map(p => `${p.name}=test`).join("&");
          const qs = otherParams ? `?${escapeForStringLiteral(otherParams)}` : "";
          lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}${qs}")`);
          lines.push(`    assert 400 <= response.status_code < 500`);
          lines.push(``);
        }
      }

      // Enhanced auth tests
      lines.push(`def ${funcName}_with_auth():`);
      lines.push(`    """Test ${safeMethod} ${safePath} with valid Authorization header"""`);
      if (this.hasBody(ep)) {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(`);
        lines.push(`        f"{BASE_URL}${safeTestPath}",`);
        lines.push(`        json=${this.buildPythonBody(ep)},`);
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

      // No auth test
      lines.push(`def ${funcName}_without_auth():`);
      lines.push(`    """Test ${safeMethod} ${safePath} without Authorization header"""`);
      if (this.hasBody(ep)) {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}", json=${this.buildPythonBody(ep)})`);
      } else {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${safeTestPath}")`);
      }
      lines.push(`    assert response.status_code < 500`);
      lines.push(``);

      // Invalid auth token test
      lines.push(`def ${funcName}_invalid_auth():`);
      lines.push(`    """Test ${safeMethod} ${safePath} with malformed Authorization header"""`);
      if (this.hasBody(ep)) {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(`);
        lines.push(`        f"{BASE_URL}${safeTestPath}",`);
        lines.push(`        json=${this.buildPythonBody(ep)},`);
        lines.push(`        headers={"Authorization": "InvalidTokenFormat"},`);
        lines.push(`    )`);
      } else {
        lines.push(`    response = requests.${ep.method.toLowerCase()}(`);
        lines.push(`        f"{BASE_URL}${safeTestPath}",`);
        lines.push(`        headers={"Authorization": "InvalidTokenFormat"},`);
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

  /**
   * Response schema validation: checks content-type, valid JSON, and known fields.
   */
  private appendTsResponseSchemaTest(lines: string[], ep: Endpoint): void {
    // Skip for DELETE/HEAD/OPTIONS which may not return a body
    if (ep.method === "DELETE" || ep.method === "HEAD" || ep.method === "OPTIONS") return;

    const testPath = this.buildTestPath(ep);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);

    lines.push(`  it("${safeMethod} ${safePath} should return valid JSON response", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
    lines.push(`      method: "${safeMethod}",`);

    if (this.hasBody(ep)) {
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify(${this.buildSampleBody(ep)}),`);
    }

    lines.push(`    });`);
    lines.push(``);
    lines.push(`    const contentType = response.headers.get("content-type") ?? "";`);
    lines.push(`    expect(contentType).toContain("application/json");`);
    lines.push(`    const data = await response.json();`);
    lines.push(`    expect(data).not.toBeNull();`);

    // If we have response field info, validate structure
    if (ep.response?.fields) {
      const fields = Object.keys(ep.response.fields);
      if (ep.response.isArray) {
        lines.push(`    expect(Array.isArray(data)).toBe(true);`);
        lines.push(`    if (data.length > 0) {`);
        for (const field of fields) {
          lines.push(`      expect(data[0]).toHaveProperty("${escapeForStringLiteral(field)}");`);
        }
        lines.push(`    }`);
      } else {
        for (const field of fields) {
          lines.push(`    expect(data).toHaveProperty("${escapeForStringLiteral(field)}");`);
        }
      }
    }

    lines.push(`  });`);
    lines.push(``);
  }

  /**
   * Smart body tests: test each known field individually (missing field, wrong type).
   */
  private appendTsSmartBodyTests(lines: string[], ep: Endpoint): void {
    const testPath = this.buildTestPath(ep);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);
    const fields = Object.entries(ep.body!.fields!);

    for (const [fieldName, fieldType] of fields) {
      const safeFieldName = escapeForStringLiteral(fieldName);

      // Test missing required field
      const bodyWithout = this.buildSampleBodyWithout(ep, fieldName);
      lines.push(`  it("${safeMethod} ${safePath} without '${safeFieldName}' should return 4xx", async () => {`);
      lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
      lines.push(`      method: "${safeMethod}",`);
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify(${bodyWithout}),`);
      lines.push(`    });`);
      lines.push(``);
      lines.push(`    expect(response.status).toBeGreaterThanOrEqual(400);`);
      lines.push(`    expect(response.status).toBeLessThan(500);`);
      lines.push(`  });`);
      lines.push(``);

      // Test wrong type
      const wrongVal = fieldType === "number" || fieldType === "integer" ? '"not_a_number"' : "12345";
      const bodyWrong = this.buildSampleBodyWithWrongType(ep, fieldName, wrongVal);
      lines.push(`  it("${safeMethod} ${safePath} with wrong type for '${safeFieldName}' should not 500", async () => {`);
      lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
      lines.push(`      method: "${safeMethod}",`);
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify(${bodyWrong}),`);
      lines.push(`    });`);
      lines.push(``);
      lines.push(`    expect(response.status).toBeLessThan(500);`);
      lines.push(`  });`);
      lines.push(``);
    }
  }

  /**
   * Query parameter tests: test endpoints with query params.
   */
  private appendTsQueryParamTests(lines: string[], ep: Endpoint): void {
    const queryParams = ep.params.filter((p) => p.location === "query");
    if (queryParams.length === 0) return;

    const testPath = this.buildTestPath(ep);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);

    // Test with all query params provided
    const paramStr = queryParams.map(p => `${p.name}=test`).join("&");
    lines.push(`  it("${safeMethod} ${safePath} with query params should not 500", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}?${escapeForStringLiteral(paramStr)}\`, {`);
    lines.push(`      method: "${safeMethod}",`);
    lines.push(`    });`);
    lines.push(``);
    lines.push(`    expect(response.status).toBeLessThan(500);`);
    lines.push(`  });`);
    lines.push(``);

    // Test without required query params (should get 4xx)
    for (const param of queryParams.filter(p => p.required)) {
      const safeParamName = escapeForStringLiteral(param.name);
      const otherParams = queryParams
        .filter(p => p.name !== param.name)
        .map(p => `${p.name}=test`)
        .join("&");
      const qs = otherParams ? `?${escapeForStringLiteral(otherParams)}` : "";

      lines.push(`  it("${safeMethod} ${safePath} without required query param '${safeParamName}' should return 4xx", async () => {`);
      lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}${qs}\`, {`);
      lines.push(`      method: "${safeMethod}",`);
      lines.push(`    });`);
      lines.push(``);
      lines.push(`    expect(response.status).toBeGreaterThanOrEqual(400);`);
      lines.push(`    expect(response.status).toBeLessThan(500);`);
      lines.push(`  });`);
      lines.push(``);
    }

    // Test with boundary query param values
    for (const param of queryParams) {
      const paramType = param.type ?? "string";
      const values = QUERY_PARAM_VALUES[paramType] ?? QUERY_PARAM_VALUES["string"];

      for (const val of values) {
        if (val === "test") continue; // skip default
        const safeParamName = escapeForStringLiteral(param.name);
        const safeVal = escapeForStringLiteral(val);
        const otherParams = queryParams
          .filter(p => p.name !== param.name)
          .map(p => `${p.name}=test`)
          .join("&");
        const allParams = otherParams
          ? `${param.name}=${val}&${otherParams}`
          : `${param.name}=${val}`;

        lines.push(`  it("${safeMethod} ${safePath} with ${safeParamName}=${safeVal} should not 500", async () => {`);
        lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}?${escapeForStringLiteral(allParams)}\`, {`);
        lines.push(`      method: "${safeMethod}",`);
        lines.push(`    });`);
        lines.push(``);
        lines.push(`    expect(response.status).toBeLessThan(500);`);
        lines.push(`  });`);
        lines.push(``);
      }
    }
  }

  /**
   * Enhanced auth tests: valid token, no token, and malformed token.
   */
  private appendTsAuthTests(lines: string[], ep: Endpoint): void {
    const testPath = this.buildTestPath(ep);
    const safeMethod = escapeForStringLiteral(ep.method);
    const safePath = escapeForStringLiteral(ep.path);
    const safeTestPath = escapeForStringLiteral(testPath);

    // Test with valid Bearer token
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

    // Test without auth header
    lines.push(`  it("${safeMethod} ${safePath} without auth should not 500", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
    lines.push(`      method: "${safeMethod}",`);

    if (this.hasBody(ep)) {
      lines.push(`      headers: { "Content-Type": "application/json" },`);
      lines.push(`      body: JSON.stringify(${this.buildSampleBody(ep)}),`);
    }

    lines.push(`    });`);
    lines.push(``);
    lines.push(`    expect(response.status).toBeLessThan(500);`);
    lines.push(`  });`);
    lines.push(``);

    // Test with malformed auth token
    lines.push(`  it("${safeMethod} ${safePath} with invalid auth should not 500", async () => {`);
    lines.push(`    const response = await fetch(\`\${BASE_URL}${safeTestPath}\`, {`);
    lines.push(`      method: "${safeMethod}",`);

    if (this.hasBody(ep)) {
      lines.push(`      headers: { "Content-Type": "application/json", "Authorization": "InvalidTokenFormat" },`);
      lines.push(`      body: JSON.stringify(${this.buildSampleBody(ep)}),`);
    } else {
      lines.push(`      headers: { "Authorization": "InvalidTokenFormat" },`);
    }

    lines.push(`    });`);
    lines.push(``);
    lines.push(`    expect(response.status).toBeLessThan(500);`);
    lines.push(`  });`);
    lines.push(``);
  }

  // --- Utility methods ---

  private hasBody(ep: Endpoint): boolean {
    return ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH";
  }

  private buildSampleBody(ep: Endpoint): string {
    if (ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
      const entries = Object.entries(ep.body.fields).map(([key, type]) => {
        const safeKey = escapeForStringLiteral(key);
        const sampleValue = this.sampleValueForType(type, safeKey);
        return `"${safeKey}": ${sampleValue}`;
      });
      return `{ ${entries.join(", ")} }`;
    }
    return "{}";
  }

  /**
   * Build sample body with one field omitted (for missing-field tests).
   */
  private buildSampleBodyWithout(ep: Endpoint, omitField: string): string {
    if (!ep.body?.fields) return "{}";
    const entries = Object.entries(ep.body.fields)
      .filter(([key]) => key !== omitField)
      .map(([key, type]) => {
        const safeKey = escapeForStringLiteral(key);
        return `"${safeKey}": ${this.sampleValueForType(type, safeKey)}`;
      });
    return entries.length > 0 ? `{ ${entries.join(", ")} }` : "{}";
  }

  /**
   * Build sample body with one field set to a wrong type value.
   */
  private buildSampleBodyWithWrongType(ep: Endpoint, targetField: string, wrongValue: string): string {
    if (!ep.body?.fields) return "{}";
    const entries = Object.entries(ep.body.fields).map(([key, type]) => {
      const safeKey = escapeForStringLiteral(key);
      if (key === targetField) {
        return `"${safeKey}": ${wrongValue}`;
      }
      return `"${safeKey}": ${this.sampleValueForType(type, safeKey)}`;
    });
    return `{ ${entries.join(", ")} }`;
  }

  /**
   * Generate a sample value for a given type.
   */
  private sampleValueForType(type: string, fieldName: string): string {
    switch (type) {
      case "number":
      case "integer":
      case "int":
      case "float":
        return "1";
      case "boolean":
      case "bool":
        return "true";
      case "array":
        return "[]";
      case "object":
        return "{}";
      default:
        return `"test-${fieldName}"`;
    }
  }

  /**
   * Build a Python dict body.
   */
  private buildPythonBody(ep: Endpoint): string {
    if (ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
      const entries = Object.entries(ep.body.fields).map(([key, type]) => {
        const val = this.pythonSampleValue(type, key);
        return `"${escapeForStringLiteral(key)}": ${val}`;
      });
      return `{${entries.join(", ")}}`;
    }
    return "{}";
  }

  private buildPythonBodyWithout(ep: Endpoint, omitField: string): string {
    if (!ep.body?.fields) return "{}";
    const entries = Object.entries(ep.body.fields)
      .filter(([key]) => key !== omitField)
      .map(([key, type]) => `"${escapeForStringLiteral(key)}": ${this.pythonSampleValue(type, key)}`);
    return entries.length > 0 ? `{${entries.join(", ")}}` : "{}";
  }

  private buildPythonBodyWithWrongType(ep: Endpoint, targetField: string, wrongValue: string): string {
    if (!ep.body?.fields) return "{}";
    const entries = Object.entries(ep.body.fields).map(([key, type]) => {
      if (key === targetField) return `"${escapeForStringLiteral(key)}": ${wrongValue}`;
      return `"${escapeForStringLiteral(key)}": ${this.pythonSampleValue(type, key)}`;
    });
    return `{${entries.join(", ")}}`;
  }

  private pythonSampleValue(type: string, fieldName: string): string {
    switch (type) {
      case "number":
      case "integer":
      case "int":
      case "float":
        return "1";
      case "boolean":
      case "bool":
        return "True";
      case "array":
        return "[]";
      case "object":
        return "{}";
      default:
        return `"test-${escapeForStringLiteral(fieldName)}"`;
    }
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
