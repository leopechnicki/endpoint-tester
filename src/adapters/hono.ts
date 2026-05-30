import type { Adapter, Endpoint, EndpointParam, EndpointResponse, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options", "all"] as const;

/**
 * Parses Hono route definitions from source code.
 *
 * Handles patterns like:
 *   app.get('/path', handler)
 *   app.post('/path', middleware, handler)
 *   app.use('/prefix', subApp)
 *   app.route('/group', subApp)
 *   Typed params like :id
 *
 * Hono is a fast, lightweight HTTP framework for the Web Standards API
 * (Cloudflare Workers, Bun, Deno, Node.js).
 */
export class HonoAdapter implements Adapter {
  readonly framework = Framework.Hono;
  readonly fileExtensions = [".ts", ".js", ".mjs", ".cjs"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect route groups mounted via app.route('/prefix', subApp)
    // and middleware mounts via app.use('/prefix', subApp)
    const routePrefixes = this.detectRoutePrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Standard method call: app.get('/path', handler)
      const parsed = this.parseLine(line, i + 1, filePath, routePrefixes);
      if (parsed) {
        endpoints.push(...parsed);
        continue;
      }
    }

    // Post-process: infer body fields, query params, response shape
    this.inferFromSource(source, endpoints);

    return endpoints;
  }

  private parseLine(
    line: string,
    lineNumber: number,
    filePath?: string,
    prefixes?: Map<string, string>,
  ): Endpoint[] | null {
    // Match: identifier.method('/path', ...)
    const pattern = new RegExp(
      `(\\w+)\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      "i",
    );
    const match = line.match(pattern);
    if (!match) return null;

    const [, identifier, method, path] = match;

    // Skip app.route() and app.use() calls (those are prefix mounts, not route definitions)
    // They are handled by detectRoutePrefixes
    if (method.toLowerCase() === "route" || method.toLowerCase() === "use") return null;

    let fullPath = path;
    if (prefixes && identifier && prefixes.has(identifier)) {
      const prefix = prefixes.get(identifier)!;
      fullPath = prefix + (path.startsWith("/") ? path : "/" + path);
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
    // Hono supports :param style (same as Express)
    const paramPattern = /:(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = paramPattern.exec(path)) !== null) {
      params.push({ name: match[1], location: "path", type: "string", required: true });
    }
    return params;
  }

  /**
   * Detect mounted route groups and middleware prefixes.
   *
   * Patterns:
   *   app.route('/api', apiRouter)           — route group
   *   app.use('/static', staticMiddleware)   — middleware mount with prefix
   */
  private detectRoutePrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();

    // app.route('/prefix', subApp) — Hono route grouping
    const routePattern = /(\w+)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(source)) !== null) {
      // match[3] is the sub-app identifier, match[2] is the prefix
      prefixes.set(match[3], match[2]);
    }

    // app.use('/prefix', subApp) — middleware mount
    const usePattern = /(\w+)\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g;
    while ((match = usePattern.exec(source)) !== null) {
      prefixes.set(match[3], match[2]);
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

      if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
        const fields = this.inferBodyFields(block);
        if (Object.keys(fields).length > 0) {
          ep.body = { type: "object", fields };
        }
      }

      const queryParams = this.inferQueryParams(block);
      for (const qp of queryParams) {
        if (!ep.params.some(p => p.name === qp.name && p.location === "query")) {
          ep.params.push(qp);
        }
      }

      const responseInfo = this.inferResponseFields(block);
      if (responseInfo) ep.response = responseInfo;
    }
  }

  private inferBodyFields(block: string): Record<string, string> {
    const fields: Record<string, string> = {};
    let match: RegExpExecArray | null;

    // Hono: const body = await c.req.json(); body.field
    // or: const { field } = await c.req.json()
    // or: c.req.json() usage followed by .field
    const dotPattern = /(?:body|data|payload)\.(\w+)/g;
    while ((match = dotPattern.exec(block)) !== null) {
      fields[match[1]] = "string";
    }

    // Destructuring from c.req.json()
    const destructPattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:await\s+)?c\.req\.json\s*\(\s*\)/g;
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
    let match: RegExpExecArray | null;

    // c.req.query('param') or c.req.query("param")
    const queryCallPattern = /c\.req\.query\s*\(\s*['"](\w+)['"]\s*\)/g;
    while ((match = queryCallPattern.exec(block)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({ name: match[1], location: "query", type: "string" });
      }
    }

    // c.req.queries('param')
    const queriesCallPattern = /c\.req\.queries\s*\(\s*['"](\w+)['"]\s*\)/g;
    while ((match = queriesCallPattern.exec(block)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({ name: match[1], location: "query", type: "string" });
      }
    }

    return params;
  }

  private inferResponseFields(block: string): EndpointResponse | null {
    // c.json({ field: value })
    const pattern = /c\.json\s*\(\s*\{([^}]*)\}/;
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
