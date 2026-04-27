import type { Adapter, Endpoint, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

/**
 * Parses standard library net/http route definitions from Go source code.
 *
 * Handles patterns like:
 *   http.HandleFunc("/path", handler)
 *   mux.HandleFunc("/path", handler)
 */
export class NetHttpAdapter implements Adapter {
  readonly framework = Framework.NetHttp;
  readonly fileExtensions = [".go"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, i + 1, filePath);
      if (parsed) {
        endpoints.push(parsed);
      }
    }

    return endpoints;
  }

  private parseLine(
    line: string,
    lineNumber: number,
    filePath?: string,
  ): Endpoint | null {
    // Match: identifier.HandleFunc("/path", handler) or http.HandleFunc("/path", handler)
    const pattern = /(\w+)\.HandleFunc\s*\(\s*"([^"]+)"\s*,\s*(\w+)/;
    const match = line.match(pattern);
    if (!match) return null;

    const [, , path, handler] = match;

    // Normalize: ensure leading slash
    let fullPath = path;
    if (!fullPath.startsWith("/")) {
      fullPath = "/" + fullPath;
    }

    // net/http HandleFunc registers for all methods — we emit GET as the canonical method
    // since net/http doesn't specify a method in the registration; handler logic decides
    return {
      method: "GET" as HttpMethod,
      path: fullPath,
      handler,
      params: [],
      file: filePath,
      line: lineNumber,
    };
  }
}
