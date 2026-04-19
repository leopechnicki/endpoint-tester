import type { Adapter, Endpoint, EndpointParam, EndpointResponse, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options", "all"] as const;

/**
 * Parses Koa route definitions from source code.
 *
 * Handles patterns like:
 *   router.get('/path', handler)
 *   router.post('/path', middleware, handler)
 *   router.prefix('/api')
 *   Route parameters like :id
 */
export class KoaAdapter implements Adapter {
  readonly framework = Framework.Koa;
  readonly fileExtensions = [".ts", ".js", ".mjs", ".cjs"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    const prefixes = this.detectRouterPrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const parsed = this.parseLine(line, i + 1, filePath, prefixes);
      if (parsed) {
        endpoints.push(...parsed);
      }
    }

    // Post-process: infer body/query/response
    this.inferFromSource(source, endpoints);

    return endpoints;
  }

  private parseLine(
    line: string,
    lineNumber: number,
    filePath?: string,
    prefixes?: Map<string, string>,
  ): Endpoint[] | null {
    // Match: router.method('/path', ...)
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

    const handler = this.extractHandler(line);
    const params = this.extractParams(fullPath);

    if (method.toLowerCase() === "all") {
      const allMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
      return allMethods.map((m) => ({
        method: m,
        path: fullPath,
        handler,
        params: [...params],
        file: filePath,
        line: lineNumber,
      }));
    }

    return [{
      method: method.toUpperCase() as HttpMethod,
      path: fullPath,
      handler,
      params,
      file: filePath,
      line: lineNumber,
    }];
  }

  private extractHandler(line: string): string {
    const match = line.match(/,\s*(\w+)\s*\)?\s*;?\s*$/);
    if (match) return match[1];
    if (line.includes("=>") || line.includes("function")) return "<anonymous>";
    return "<unknown>";
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

  private detectRouterPrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();
    // router.prefix('/api')
    const prefixPattern = /(\w+)\.prefix\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = prefixPattern.exec(source)) !== null) {
      prefixes.set(match[1], match[2]);
    }
    // app.use('/prefix', router.routes())
    const usePattern = /\w+\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\.routes\s*\(\s*\)/g;
    while ((match = usePattern.exec(source)) !== null) {
      prefixes.set(match[2], match[1]);
    }
    return prefixes;
  }

  private inferFromSource(source: string, endpoints: Endpoint[]): void {
    for (const ep of endpoints) {
      if (!ep.line) continue;
      const lines = source.split("\n");
      const startLine = ep.line - 1;
      const endLine = Math.min(startLine + 50, lines.length);
      const block = lines.slice(startLine, endLine).join("\n");

      // Koa uses ctx.request.body or ctx.body for request body
      if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
        const fields = this.inferBodyFields(block);
        if (Object.keys(fields).length > 0) {
          ep.body = { type: "object", fields };
        }
      }

      // Koa uses ctx.query or ctx.request.query
      const queryParams = this.inferQueryParams(block);
      for (const qp of queryParams) {
        if (!ep.params.some(p => p.name === qp.name && p.location === "query")) {
          ep.params.push(qp);
        }
      }

      // Response from ctx.body = { ... }
      const responseInfo = this.inferResponseFields(block);
      if (responseInfo) ep.response = responseInfo;
    }
  }

  private inferBodyFields(block: string): Record<string, string> {
    const fields: Record<string, string> = {};
    // ctx.request.body.field or ctx.body.field (when used as request body with bodyparser)
    const dotPattern = /ctx\.(?:request\.)?body\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotPattern.exec(block)) !== null) {
      fields[match[1]] = "string";
    }
    // const { x, y } = ctx.request.body
    const destructPattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*ctx\.(?:request\.)?body/g;
    while ((match = destructPattern.exec(block)) !== null) {
      for (const f of match[1].split(",").map(s => s.trim().split(":")[0].split("=")[0].trim())) {
        if (f && /^\w+$/.test(f)) fields[f] = "string";
      }
    }
    return fields;
  }

  private inferQueryParams(block: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    const seen = new Set<string>();
    // ctx.query.param or ctx.request.query.param
    const dotPattern = /ctx\.(?:request\.)?query\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotPattern.exec(block)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({ name: match[1], location: "query", type: "string" });
      }
    }
    // const { x } = ctx.query
    const destructPattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*ctx\.(?:request\.)?query/g;
    while ((match = destructPattern.exec(block)) !== null) {
      for (const f of match[1].split(",").map(s => s.trim().split(":")[0].split("=")[0].trim())) {
        if (f && /^\w+$/.test(f) && !seen.has(f)) {
          seen.add(f);
          params.push({ name: f, location: "query", type: "string" });
        }
      }
    }
    return params;
  }

  private inferResponseFields(block: string): EndpointResponse | null {
    // ctx.body = { field: value }
    const pattern = /ctx\.body\s*=\s*\{([^}]*)\}/;
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
