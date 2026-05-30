import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options", "all"] as const;

/**
 * Parses Hono framework route definitions from TypeScript/JavaScript source.
 *
 * Handles patterns like:
 *   app.get('/path', handler)
 *   app.post('/path', middleware, handler)
 *   app.use('/prefix', subApp)
 *   app.route('/prefix', subApp)
 *   const route = new Hono()
 *   route.get('/path', handler)
 *   app.get('/users/:id', handler)   -- path params
 *
 * @example
 * ```typescript
 * import { HonoAdapter } from 'endpoint-tester'
 *
 * const adapter = new HonoAdapter()
 * const endpoints = adapter.parse(sourceCode, 'src/routes.ts')
 * ```
 */
export class HonoAdapter implements Adapter {
  readonly framework = Framework.Hono;
  readonly fileExtensions = [".ts", ".js", ".mjs", ".tsx"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect app variable names: const app = new Hono(), const router = new Hono()
    const honoVarNames = this.detectHonoVarNames(source);

    // Detect .use() prefixes to resolve sub-app mounting
    const usePrefixes = this.detectUsePrefixes(source, honoVarNames);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      const parsed = this.parseLine(line, lineNum, filePath, honoVarNames, usePrefixes);
      endpoints.push(...parsed);
    }

    return endpoints;
  }

  private detectHonoVarNames(source: string): Set<string> {
    const names = new Set<string>(["app", "router", "hono"]);

    // Match: const app = new Hono() or const router = new Hono<Env>()
    const honoVarRegex = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+Hono(?:<[^>]*>)?\s*\(/g;
    let match;
    while ((match = honoVarRegex.exec(source)) !== null) {
      names.add(match[1]);
    }

    return names;
  }

  private detectUsePrefixes(source: string, honoVars: Set<string>): Map<string, string> {
    const prefixes = new Map<string, string>();

    // Match: app.use('/prefix', subVar) or app.route('/prefix', subVar)
    const backtick = String.fromCharCode(96);
    const useRegex = new RegExp(
      `(?:${[...honoVars].join("|")})\s*\.(?:use|route)\s*\(\s*['"${backtick}]([^'"${backtick}]+)['"${backtick}]\s*,\s*(\w+)`,
      "g"
    );

    let match;
    while ((match = useRegex.exec(source)) !== null) {
      const prefix = match[1].replace(/\/+$/, ""); // strip trailing slash
      const varName = match[2];
      prefixes.set(varName, prefix);
    }

    return prefixes;
  }

  private parseLine(
    line: string,
    lineNum: number,
    filePath: string | undefined,
    honoVars: Set<string>,
    usePrefixes: Map<string, string>
  ): Endpoint[] {
    const endpoints: Endpoint[] = [];

    // Match: varName.method('/path', handler) or varName.method('/path', mw, handler)
    // Supports chained calls and template literals
    const bt = String.fromCharCode(96);
    const methodPattern = new RegExp(
      `(${[...honoVars].join("|")}|\w+)\s*\.\s*(${HTTP_METHODS.join("|")})\s*\(\s*['"${bt}]([^'"${bt}]+)['"${bt}]`,
      "i"
    );

    const match = methodPattern.exec(line);
    if (!match) return endpoints;

    const varName = match[1];
    const method = match[2].toUpperCase() as HttpMethod;
    const rawPath = match[3];

    // Only include if the var is a known Hono instance or a sub-app
    if (!honoVars.has(varName) && !usePrefixes.has(varName)) {
      // Check if it's a lowercase method call — could be a Hono sub-app variable
      // registered via .use() — include it if method matches
      if (!HTTP_METHODS.includes(match[2].toLowerCase() as typeof HTTP_METHODS[number])) {
        return endpoints;
      }
    }

    // Resolve prefix from .use() or .route() mounting
    const prefix = usePrefixes.get(varName) ?? "";
    const fullPath = prefix ? `${prefix}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}` : rawPath;

    // Extract path parameters (:id, :userId, etc.)
    const params = this.extractPathParams(fullPath);

    if (method !== "ALL") {
      endpoints.push({
        method,
        path: fullPath,
        handler: this.extractHandlerName(line),
        params,
        file: filePath,
        line: lineNum,
      });
    } else {
      // app.all() — expand to common methods
      for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"] as HttpMethod[]) {
        endpoints.push({
          method: m,
          path: fullPath,
          handler: this.extractHandlerName(line),
          params,
          file: filePath,
          line: lineNum,
        });
      }
    }

    return endpoints;
  }

  private extractPathParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    // Match :paramName (standard Hono param syntax)
    const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = paramRegex.exec(path)) !== null) {
      params.push({ name: match[1], location: "path", required: true });
    }
    return params;
  }

  private extractHandlerName(line: string): string {
    // Try to find a named handler: app.get('/path', myHandler) -> myHandler
    const handlerMatch = /['"\`][^'"\`]+['"\`]\s*,\s*(?:[^,)]+,\s*)*([a-zA-Z_][a-zA-Z0-9_.]*)/.exec(line);
    if (handlerMatch) {
      const candidate = handlerMatch[1].trim();
      // Reject arrow functions and async keywords
      if (!candidate.startsWith("(") && candidate !== "async" && candidate !== "c") {
        return candidate;
      }
    }
    return "handler";
  }
}
