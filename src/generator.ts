import type { Endpoint, GenerateOptions } from "./types.js";

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
      default:
        throw new Error(`Unsupported test format: ${options.format}`);
    }
  }

  private generateVitest(endpoints: Endpoint[], baseUrl = "http://localhost:3000"): string {
    const lines: string[] = [
      `import { describe, it, expect } from "vitest";`,
      ``,
      `const BASE_URL = "${baseUrl}";`,
      ``,
    ];

    // Group endpoints by path prefix
    const groups = this.groupByPrefix(endpoints);

    for (const [group, eps] of Object.entries(groups)) {
      lines.push(`describe("${group}", () => {`);

      for (const ep of eps) {
        const testPath = this.buildTestPath(ep);
        lines.push(`  it("${ep.method} ${ep.path} should respond", async () => {`);
        lines.push(`    const response = await fetch(\`\${BASE_URL}${testPath}\`, {`);
        lines.push(`      method: "${ep.method}",`);

        if (ep.body && (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH")) {
          lines.push(`      headers: { "Content-Type": "application/json" },`);
          lines.push(`      body: JSON.stringify({}),`);
        }

        lines.push(`    });`);
        lines.push(``);
        lines.push(`    expect(response.status).toBeLessThan(500);`);
        lines.push(`  });`);
        lines.push(``);
      }

      lines.push(`});`);
      lines.push(``);
    }

    return lines.join("\n");
  }

  private generateJest(endpoints: Endpoint[], baseUrl = "http://localhost:3000"): string {
    const lines: string[] = [
      `const BASE_URL = "${baseUrl}";`,
      ``,
    ];

    const groups = this.groupByPrefix(endpoints);

    for (const [group, eps] of Object.entries(groups)) {
      lines.push(`describe("${group}", () => {`);

      for (const ep of eps) {
        const testPath = this.buildTestPath(ep);
        lines.push(`  it("${ep.method} ${ep.path} should respond", async () => {`);
        lines.push(`    const response = await fetch(\`\${BASE_URL}${testPath}\`, {`);
        lines.push(`      method: "${ep.method}",`);

        if (ep.body && (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH")) {
          lines.push(`      headers: { "Content-Type": "application/json" },`);
          lines.push(`      body: JSON.stringify({}),`);
        }

        lines.push(`    });`);
        lines.push(``);
        lines.push(`    expect(response.status).toBeLessThan(500);`);
        lines.push(`  });`);
        lines.push(``);
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
      `BASE_URL = "${baseUrl}"`,
      ``,
    ];

    for (const ep of endpoints) {
      const testPath = this.buildTestPath(ep);
      const funcName = this.toPythonFuncName(ep);

      lines.push(`def ${funcName}():`);
      lines.push(`    """Test ${ep.method} ${ep.path}"""`);
      lines.push(`    response = requests.${ep.method.toLowerCase()}(f"{BASE_URL}${testPath}")`);
      lines.push(`    assert response.status_code < 500`);
      lines.push(``);
    }

    return lines.join("\n");
  }

  private buildTestPath(ep: Endpoint): string {
    // Replace :param with sample values
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
}
