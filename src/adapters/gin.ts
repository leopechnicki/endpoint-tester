import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;

/**
 * Parses Gin (github.com/gin-gonic/gin) route definitions from Go source code.
 *
 * Handles patterns like:
 *   r.GET("/path", handler)
 *   router.POST("/users/:id", handler)
 *   v1 := r.Group("/api/v1")
 *   v1.GET("/users", ListUsers)
 */
export class GinAdapter implements Adapter {
  readonly framework = Framework.Gin;
  readonly fileExtensions = [".go"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect group prefixes: v1 := r.Group("/api/v1")
    const groupPrefixes = this.detectGroupPrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, i + 1, filePath, groupPrefixes);
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
    groupPrefixes?: Map<string, string>,
  ): Endpoint | null {
    // Match: identifier.METHOD("/path", handler) — Gin uses uppercase method names
    const methodsGroup = HTTP_METHODS.join("|");
    const pattern = new RegExp(
      `(\\w+)\\.(${methodsGroup})\\s*\\(\\s*"([^"]+)"\\s*,\\s*(\\w+)`,
      "i",
    );
    const match = line.match(pattern);
    if (!match) return null;

    const [, identifier, method, path, handler] = match;

    // Determine full path including any group prefix
    let fullPath = path;
    if (groupPrefixes && identifier && groupPrefixes.has(identifier)) {
      const prefix = groupPrefixes.get(identifier)!;
      fullPath = prefix + path;
    }

    // Normalize: ensure leading slash
    if (!fullPath.startsWith("/")) {
      fullPath = "/" + fullPath;
    }

    const params = this.extractParams(fullPath);

    return {
      method: method.toUpperCase() as HttpMethod,
      path: fullPath,
      handler,
      params,
      file: filePath,
      line: lineNumber,
    };
  }

  private extractParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    // Gin uses :param syntax
    const paramPattern = /:(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = paramPattern.exec(path)) !== null) {
      params.push({
        name: match[1],
        location: "path",
        type: "string",
        required: true,
      });
    }

    return params;
  }

  /**
   * Detect Gin group prefixes from patterns like:
   *   v1 := r.Group("/api/v1")
   *   api := router.Group("/api")
   */
  private detectGroupPrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();

    const groupPattern = /(\w+)\s*:?=\s*\w+\.Group\s*\(\s*"([^"]+)"\s*\)/g;
    let match: RegExpExecArray | null;

    while ((match = groupPattern.exec(source)) !== null) {
      const [, varName, prefix] = match;
      prefixes.set(varName, prefix);
    }

    return prefixes;
  }
}
