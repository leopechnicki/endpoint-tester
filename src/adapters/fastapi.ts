import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/**
 * Parses FastAPI route definitions from Python source code.
 *
 * Handles patterns like:
 *   @app.get("/path")
 *   @router.post("/path")
 *   Path parameters like {id}
 */
export class FastAPIAdapter implements Adapter {
  readonly framework = Framework.FastAPI;
  readonly fileExtensions = [".py"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect router prefix: router = APIRouter(prefix="/prefix")
    const routerPrefixes = this.detectRouterPrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, lines, i, filePath, routerPrefixes);
      if (parsed) {
        endpoints.push(parsed);
      }
    }

    return endpoints;
  }

  private parseLine(
    line: string,
    allLines: string[],
    lineIndex: number,
    filePath?: string,
    routerPrefixes?: Map<string, string>,
  ): Endpoint | null {
    // Match: @identifier.method("/path") or @identifier.method("/path", ...)
    const decoratorPattern = new RegExp(
      `@(\\w+)\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*['"]([^'"]+)['"]`,
      "i",
    );
    const match = line.match(decoratorPattern);
    if (!match) return null;

    const [, identifier, method, path] = match;

    // Determine full path including router prefix
    let fullPath = path;
    if (routerPrefixes && identifier && routerPrefixes.has(identifier)) {
      const prefix = routerPrefixes.get(identifier)!;
      fullPath = prefix + path;
    }

    // Normalize: ensure leading slash
    if (!fullPath.startsWith("/")) {
      fullPath = "/" + fullPath;
    }

    // Convert FastAPI {param} to :param for consistency
    const normalizedPath = fullPath.replace(/\{(\w+)\}/g, ":$1");

    // Extract handler name from next line (def function_name)
    const handler = this.extractHandler(allLines, lineIndex);

    // Extract route parameters
    const params = this.extractParams(fullPath);

    return {
      method: method.toUpperCase() as HttpMethod,
      path: normalizedPath,
      handler,
      params,
      file: filePath,
      line: lineIndex + 1,
    };
  }

  private extractHandler(lines: string[], decoratorIndex: number): string {
    // Look at lines after the decorator for `def function_name`
    for (let i = decoratorIndex + 1; i < Math.min(decoratorIndex + 5, lines.length); i++) {
      const defMatch = lines[i].match(/^\s*(?:async\s+)?def\s+(\w+)/);
      if (defMatch) return defMatch[1];
    }
    return "<unknown>";
  }

  private extractParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
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

  private detectRouterPrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();

    // Match: identifier = APIRouter(prefix="/prefix")
    const routerPattern = /(\w+)\s*=\s*APIRouter\s*\(\s*prefix\s*=\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = routerPattern.exec(source)) !== null) {
      const [, routerName, prefix] = match;
      prefixes.set(routerName, prefix);
    }

    return prefixes;
  }
}
