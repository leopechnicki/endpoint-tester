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
      const parsed = this.parseLine(line, i + 1, filePath, routerPrefixes);
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
    routerPrefixes?: Map<string, string>,
  ): Endpoint | null {
    // Match: identifier.method('/path', ...)
    const methodPattern = new RegExp(
      `(\\w+)\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      "i",
    );
    const match = line.match(methodPattern);
    if (!match) return null;

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

    return {
      method: method.toUpperCase() as HttpMethod,
      path: fullPath,
      handler,
      params,
      file: filePath,
      line: lineNumber,
    };
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
   * Detect router prefix mappings from app.use('/prefix', routerName)
   */
  private detectRouterPrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();

    // Match: app.use('/prefix', routerIdentifier)
    const usePattern = /app\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g;
    let match: RegExpExecArray | null;

    while ((match = usePattern.exec(source)) !== null) {
      const [, prefix, routerName] = match;
      prefixes.set(routerName, prefix);
    }

    return prefixes;
  }
}
