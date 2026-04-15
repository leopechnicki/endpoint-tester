import { describe, it, expect } from "vitest";
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
});
