import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Scanner } from "../src/scanner.js";
import type { Adapter, Endpoint } from "../src/types.js";
import { Framework } from "../src/types.js";

function createMockAdapter(endpoints: Endpoint[]): Adapter {
  return {
    framework: Framework.Express,
    fileExtensions: [".ts", ".js"],
    parse: () => endpoints,
  };
}

describe("Scanner", () => {
  it("should create a scanner with a custom adapter", () => {
    const adapter = createMockAdapter([]);
    const scanner = new Scanner(adapter);
    expect(scanner).toBeDefined();
  });

  it("should parse source code using the adapter", () => {
    const mockEndpoints: Endpoint[] = [
      {
        method: "GET",
        path: "/users",
        handler: "getUsers",
        params: [],
      },
      {
        method: "POST",
        path: "/users",
        handler: "createUser",
        params: [],
      },
    ];

    const adapter = createMockAdapter(mockEndpoints);
    const scanner = new Scanner(adapter);
    const result = scanner.parseSource("any source code");

    expect(result).toEqual(mockEndpoints);
    expect(result).toHaveLength(2);
  });

  it("should allow changing the adapter", () => {
    const adapter1 = createMockAdapter([
      { method: "GET", path: "/a", handler: "a", params: [] },
    ]);
    const adapter2 = createMockAdapter([
      { method: "POST", path: "/b", handler: "b", params: [] },
    ]);

    const scanner = new Scanner(adapter1);
    expect(scanner.parseSource("code")[0].path).toBe("/a");

    scanner.setAdapter(adapter2);
    expect(scanner.parseSource("code")[0].path).toBe("/b");
  });

  describe("scan() deduplication", () => {
    const TMP = join(process.cwd(), ".test-scanner-dedup");

    afterEach(() => {
      try {
        rmSync(TMP, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it("deduplicates endpoints with the same method and path across files", async () => {
      mkdirSync(TMP, { recursive: true });
      writeFileSync(join(TMP, "a.ts"), "// file a");
      writeFileSync(join(TMP, "b.ts"), "// file b");

      // Adapter always returns the same endpoint regardless of which file is parsed
      const adapter = createMockAdapter([
        { method: "GET", path: "/health", handler: "healthCheck", params: [] },
      ]);

      const scanner = new Scanner(adapter);
      const endpoints = await scanner.scan({ directory: TMP, framework: Framework.Express });

      // Two .ts files → adapter called twice → would yield 2 without deduplication
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/health");
    });

    it("preserves distinct endpoints from different files", async () => {
      mkdirSync(TMP, { recursive: true });
      writeFileSync(join(TMP, "users.ts"), "// users");
      writeFileSync(join(TMP, "posts.ts"), "// posts");

      let callCount = 0;
      const adapter: Adapter = {
        framework: Framework.Express,
        fileExtensions: [".ts"],
        parse: () => {
          callCount++;
          return callCount === 1
            ? [{ method: "GET", path: "/users", handler: "getUsers", params: [] }]
            : [{ method: "GET", path: "/posts", handler: "getPosts", params: [] }];
        },
      };

      const scanner = new Scanner(adapter);
      const endpoints = await scanner.scan({ directory: TMP, framework: Framework.Express });

      expect(endpoints).toHaveLength(2);
    });
  });
});
