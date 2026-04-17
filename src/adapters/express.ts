import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/**
 * Parses Express.js route definitions from source code.
 *
 * Handles patterns like:
 *   app.get('/path', handler)
 *   app.post('/path', middleware, handler)
 *   router.get('/path', handler)
 *   app.route('/path').get(handler).post(handler)
 *   router.use('/prefix', subRouter)
 *   Route parameters like :id
 */
export class ExpressAdapter implements Adapter {
  readonly framework = Framework.Express;
  readonly fileExtensions = [".ts", ".js", ".mjs", ".cjs"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect router prefix: router = express.Router() used with app.use('/prefix', router)
    const routerPrefixes = this.detectRouterPrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Try standard method pattern first
      const parsed = this.parseLine(line, i + 1, filePath, routerPrefixes);
      if (parsed.length > 0) {
        endpoints.push(...parsed);
        continue;
      }

      // Try app.route('/path').get().post() chaining pattern
      const routeChain = this.parseRouteChain(line, lines, i, filePath, routerPrefixes);
      if (routeChain.length > 0) {
        endpoints.push(...routeChain);
      }
    }

    return endpoints;
  }

  private parseLine(
    line: string,
    lineNumber: number,
    filePath?: string,
    routerPrefixes?: Map<string, string>,
  ): Endpoint[] {
    // Match: identifier.method('/path', ...) — global flag to catch multiple routes per line
    const methodPattern = new RegExp(
      `(\\w+)\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      "gi",
    );

    const results: Endpoint[] = [];
    for (const match of line.matchAll(methodPattern)) {
      const [, identifier, method, path] = match;

      // Determine the full path including any router prefix
      let fullPath = path;
      if (routerPrefixes && identifier && routerPrefixes.has(identifier)) {
        const prefix = routerPrefixes.get(identifier)!;
        fullPath = prefix + path;
      }

      // Normalize path: ensure leading slash
      if (!fullPath.startsWith("/")) {
        fullPath = "/" + fullPath;
      }

      // Extract handler name (last function argument)
      const handler = this.extractHandler(line);

      // Extract route parameters from path (e.g. :id)
      const params = this.extractParams(fullPath);

      results.push({
        method: method.toUpperCase() as HttpMethod,
        path: fullPath,
        handler,
        params,
        file: filePath,
        line: lineNumber,
      });
    }

    return results;
  }

  /**
   * Parse app.route('/path').get(handler).post(handler) chaining pattern.
   * This can span a single line or multiple lines.
   */
  private parseRouteChain(
    line: string,
    allLines: string[],
    lineIndex: number,
    filePath?: string,
    routerPrefixes?: Map<string, string>,
  ): Endpoint[] {
    // Match: identifier.route('/path')
    const routeMatch = line.match(/(\w+)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (!routeMatch) return [];

    const [, identifier, path] = routeMatch;
    const endpoints: Endpoint[] = [];

    // Determine full path
    let fullPath = path;
    if (routerPrefixes && identifier && routerPrefixes.has(identifier)) {
      const prefix = routerPrefixes.get(identifier)!;
      fullPath = prefix + path;
    }
    if (!fullPath.startsWith("/")) {
      fullPath = "/" + fullPath;
    }

    const params = this.extractParams(fullPath);

    // Collect lines that are part of this chain (current line + continuation lines)
    let chainText = line;
    for (let j = lineIndex + 1; j < Math.min(lineIndex + 10, allLines.length); j++) {
      const nextLine = allLines[j].trim();
      // If line starts with .method( it's a continuation
      if (nextLine.match(/^\.(get|post|put|delete|patch|head|options)\s*\(/i)) {
        chainText += " " + nextLine;
      } else if (chainText.includes(".route(") && nextLine.startsWith(".")) {
        chainText += " " + nextLine;
      } else {
        break;
      }
    }

    // Extract all .method() calls from the chain
    const methodCallPattern = new RegExp(
      `\\.(${HTTP_METHODS.join("|")})\\s*\\(`,
      "gi",
    );
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodCallPattern.exec(chainText)) !== null) {
      endpoints.push({
        method: methodMatch[1].toUpperCase() as HttpMethod,
        path: fullPath,
        handler: "<chained>",
        params: [...params],
        file: filePath,
        line: lineIndex + 1,
      });
    }

    return endpoints;
  }

  private extractHandler(line: string): string {
    // Try to find the last named function/identifier before the closing paren
    // Pattern: ..., handlerName) or ..., handlerName);
    const handlerMatch = line.match(/,\s*(\w+)\s*\)?\s*;?\s*$/);
    if (handlerMatch) return handlerMatch[1];

    // Inline arrow function or anonymous
    if (line.includes("=>") || line.includes("function")) {
      return "<anonymous>";
    }

    return "<unknown>";
  }

  private extractParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
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
   * Detect router prefix mappings from:
   *   app.use('/prefix', routerName)
   *   router.use('/prefix', subRouter)
   */
  private detectRouterPrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();

    // Match: app.use('/prefix', routerIdentifier) or router.use('/prefix', routerIdentifier)
    const usePattern = /\w+\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g;
    let match: RegExpExecArray | null;

    while ((match = usePattern.exec(source)) !== null) {
      const [, prefix, routerName] = match;
      prefixes.set(routerName, prefix);
    }

    return prefixes;
  }
}
