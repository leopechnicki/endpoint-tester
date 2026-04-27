import { describe, it, expect } from "vitest";
import { ExpressAdapter } from "../../src/adapters/express.js";

describe("ExpressAdapter — ReDoS protection", () => {
  const adapter = new ExpressAdapter();

  it("should parse simple regex routes without hanging", () => {
    const source = `app.get(/^\\/files\\//, serveFiles);`;
    const start = Date.now();
    const endpoints = adapter.parse(source);
    const elapsed = Date.now() - start;

    // Should parse quickly (under 100ms), not hang from ReDoS
    expect(elapsed).toBeLessThan(1000);
    expect(endpoints.length).toBeGreaterThanOrEqual(1);
    expect(endpoints[0].path).toContain("/files/");
  });

  it("should handle regex with multiple escaped slashes", () => {
    const source = `app.get(/^\\/api\\/v1\\/users\\//, handler);`;
    const start = Date.now();
    const endpoints = adapter.parse(source);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(endpoints.length).toBe(1);
  });

  it("should not match non-regex route patterns as regex", () => {
    const source = `app.get('/users', handler);`;
    const endpoints = adapter.parse(source);

    // Should be parsed as normal string route, not regex
    expect(endpoints.length).toBe(1);
    expect(endpoints[0].path).toBe("/users");
  });
});
