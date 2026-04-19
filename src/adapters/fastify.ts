import type { Adapter, Endpoint, EndpointParam, EndpointResponse, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/**
 * Parses Fastify route definitions from source code.
 *
 * Handles patterns like:
 *   fastify.get('/path', handler)
 *   fastify.get('/path', { schema: { ... } }, handler)
 *   fastify.route({ method: 'GET', url: '/path', handler })
 *   server.register(plugin, { prefix: '/api' })
 *   Route parameters like :id
 */
export class FastifyAdapter implements Adapter {
  readonly framework = Framework.Fastify;
  readonly fileExtensions = [".ts", ".js", ".mjs", ".cjs"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    const prefixes = this.detectPrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Try shorthand: fastify.get('/path', handler)
      const shorthand = this.parseShorthand(line, i + 1, filePath, prefixes);
      if (shorthand) {
        endpoints.push(...shorthand);
        continue;
      }

      // Try full route: fastify.route({ method: 'GET', url: '/path', ... })
      const fullRoute = this.parseFullRoute(line, lines, i, filePath, prefixes);
      if (fullRoute) {
        endpoints.push(fullRoute);
      }
    }

    // Post-process: infer body/query/response from handler code
    this.inferFromSource(source, endpoints);

    return endpoints;
  }

  private parseShorthand(
    line: string,
    lineNumber: number,
    filePath?: string,
    prefixes?: Map<string, string>,
  ): Endpoint[] | null {
    const pattern = new RegExp(
      `(\\w+)\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      "i",
    );
    const match = line.match(pattern);
    if (!match) return null;

    const [, identifier, method, path] = match;

    let fullPath = path;
    if (prefixes && identifier && prefixes.has(identifier)) {
      fullPath = prefixes.get(identifier)! + path;
    }
    if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;

    const params = this.extractParams(fullPath);
    const handler = this.extractHandler(line);

    return [{
      method: method.toUpperCase() as HttpMethod,
      path: fullPath,
      handler,
      params,
      file: filePath,
      line: lineNumber,
    }];
  }

  private parseFullRoute(
    line: string,
    allLines: string[],
    lineIndex: number,
    filePath?: string,
    _prefixes?: Map<string, string>,
  ): Endpoint | null {
    // Match: identifier.route({ ... })
    if (!line.match(/\w+\.route\s*\(/)) return null;

    // Collect multi-line block
    let block = "";
    for (let j = lineIndex; j < Math.min(lineIndex + 20, allLines.length); j++) {
      block += allLines[j] + "\n";
      if (allLines[j].includes("})") || allLines[j].includes("});")) break;
    }

    // Extract method
    const methodMatch = block.match(/method\s*:\s*['"](\w+)['"]/i);
    if (!methodMatch) return null;

    // Extract url
    const urlMatch = block.match(/url\s*:\s*['"]([^'"]+)['"]/);
    if (!urlMatch) return null;

    let fullPath = urlMatch[1];
    if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;

    const params = this.extractParams(fullPath);

    return {
      method: methodMatch[1].toUpperCase() as HttpMethod,
      path: fullPath,
      handler: "<route>",
      params,
      file: filePath,
      line: lineIndex + 1,
    };
  }

  private extractParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    const paramPattern = /:(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = paramPattern.exec(path)) !== null) {
      params.push({ name: match[1], location: "path", type: "string", required: true });
    }
    return params;
  }

  private extractHandler(line: string): string {
    const handlerMatch = line.match(/,\s*(\w+)\s*\)?\s*;?\s*$/);
    if (handlerMatch) return handlerMatch[1];
    if (line.includes("=>") || line.includes("function")) return "<anonymous>";
    return "<unknown>";
  }

  private detectPrefixes(_source: string): Map<string, string> {
    // Fastify register-based prefixes are hard to statically resolve
    // since the plugin function and identifier are disconnected.
    return new Map<string, string>();
  }

  private inferFromSource(source: string, endpoints: Endpoint[]): void {
    for (const ep of endpoints) {
      if (!ep.line) continue;
      const lines = source.split("\n");
      const startLine = ep.line - 1;
      const endLine = Math.min(startLine + 50, lines.length);
      const block = lines.slice(startLine, endLine).join("\n");

      // Infer body fields
      if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
        const fields = this.inferBodyFields(block);
        if (Object.keys(fields).length > 0) {
          ep.body = { type: "object", fields };
        }
      }

      // Infer query params
      const queryParams = this.inferQueryParams(block);
      for (const qp of queryParams) {
        if (!ep.params.some(p => p.name === qp.name && p.location === "query")) {
          ep.params.push(qp);
        }
      }

      // Infer response fields
      const responseInfo = this.inferResponseFields(block);
      if (responseInfo) ep.response = responseInfo;
    }
  }

  private inferBodyFields(block: string): Record<string, string> {
    const fields: Record<string, string> = {};
    // req.body.field or request.body.field
    const dotPattern = /(?:req|request)\.body\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotPattern.exec(block)) !== null) {
      fields[match[1]] = "string";
    }
    // const { x, y } = req.body or request.body
    const destructPattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:req|request)\.body/g;
    while ((match = destructPattern.exec(block)) !== null) {
      for (const f of match[1].split(",").map(s => s.trim().split(":")[0].split("=")[0].trim())) {
        if (f && /^\w+$/.test(f)) fields[f] = "string";
      }
    }
    // Fastify schema: properties: { name: { type: 'string' }, age: { type: 'number' } }
    // Use a pattern that captures the full properties block (handles nested braces)
    const propPattern = /(\w+)\s*:\s*\{\s*type\s*:\s*['"](\w+)['"]\s*\}/g;
    while ((match = propPattern.exec(block)) !== null) {
      // Skip non-field keys like "body", "response", "querystring"
      if (!["body", "response", "querystring", "params", "headers", "type", "object", "array"].includes(match[1])) {
        fields[match[1]] = match[2];
      }
    }
    return fields;
  }

  private inferQueryParams(block: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    const seen = new Set<string>();
    const dotPattern = /(?:req|request)\.query\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotPattern.exec(block)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({ name: match[1], location: "query", type: "string" });
      }
    }
    return params;
  }

  private inferResponseFields(block: string): EndpointResponse | null {
    const pattern = /(?:reply|res)\.send\s*\(\s*\{([^}]*)\}/;
    const match = block.match(pattern);
    if (!match) return null;
    const fields: Record<string, string> = {};
    const keyPattern = /(\w+)\s*:/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyPattern.exec(match[1])) !== null) {
      fields[keyMatch[1]] = "string";
    }
    if (Object.keys(fields).length === 0) return null;
    return { fields };
  }
}
