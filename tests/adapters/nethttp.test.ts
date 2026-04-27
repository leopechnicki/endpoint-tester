import { describe, it, expect } from "vitest";
import { NetHttpAdapter } from "../../src/adapters/nethttp.js";

describe("NetHttpAdapter", () => {
  const adapter = new NetHttpAdapter();

  it("should parse http.HandleFunc route", () => {
    const source = `http.HandleFunc("/users", handleUsers)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("handleUsers");
  });

  it("should parse mux.HandleFunc route", () => {
    const source = `mux.HandleFunc("/products", handleProducts)`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/products");
    expect(endpoints[0].handler).toBe("handleProducts");
  });

  it("should parse multiple HandleFunc calls", () => {
    const source = `
http.HandleFunc("/", handleIndex)
http.HandleFunc("/users", handleUsers)
http.HandleFunc("/health", handleHealth)
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(3);
    expect(endpoints.map((e) => e.path)).toEqual(["/", "/users", "/health"]);
  });

  it("should include file path and line number", () => {
    const source = `http.HandleFunc("/health", healthCheck)`;
    const endpoints = adapter.parse(source, "main.go");

    expect(endpoints[0].file).toBe("main.go");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-net/http code", () => {
    const source = `
func main() {
    fmt.Println("hello")
}
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });

  it("should return empty params array (net/http has no built-in param syntax)", () => {
    const source = `http.HandleFunc("/users", handleUsers)`;
    const endpoints = adapter.parse(source);

    expect(endpoints[0].params).toHaveLength(0);
  });
});
