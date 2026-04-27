import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["Get", "Post", "Put", "Delete", "Patch", "Head", "Options"] as const;

/**
 * Parses Chi (github.com/go-chi/chi) route definitions from Go source code.
 *
 * Handles patterns like:
 *   r.Get("/path", handler)
 *   r.Post("/users/{id}", handler)
 *
 * Chi uses title-case method names (Get, Post, etc.) and {param} path params.
 */
export class ChiAdapter implements Adapter {
  readonly framework = Framework.Chi;
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
    // Match: identifier.Method("/path", handler) — Chi uses title-case method names
    const methodsGroup = HTTP_METHODS.join("|");
    const pattern = new RegExp(
      `(\\w+)\\.(${methodsGroup})\\s*\\(\\s*"([^"]+)"\\s*,\\s*(\\w+)`,
    );
    const match = line.match(pattern);
    if (!match) return null;

    const [, , method, path, handler] = match;

    // Normalize: ensure leading slash
    let fullPath = path;
    if (!fullPath.startsWith("/")) {
      fullPath = "/" + fullPath;
    }

    // Chi uses {param} syntax — normalize to :param for consistency
    const normalizedPath = fullPath.replace(/\{(\w+)\}/g, ":$1");

    const params = this.extractParams(fullPath);

    return {
      method: method.toUpperCase() as HttpMethod,
      path: normalizedPath,
      handler,
      params,
      file: filePath,
      line: lineNumber,
    };
  }

  private extractParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    // Chi uses {param} syntax
    const paramPattern = /\{(\w+)\}/g;
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
}
