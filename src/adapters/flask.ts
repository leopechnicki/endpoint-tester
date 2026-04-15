import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;

/**
 * Parses Flask route definitions from Python source code.
 *
 * Handles patterns like:
 *   @app.route('/path', methods=['GET', 'POST'])
 *   @app.get('/path')
 *   @blueprint.post('/path')
 *   Route parameters like <int:id> or <name>
 */
export class FlaskAdapter implements Adapter {
  readonly framework = Framework.Flask;
  readonly fileExtensions = [".py"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect blueprint prefixes: bp = Blueprint('name', __name__, url_prefix='/prefix')
    const blueprintPrefixes = this.detectBlueprintPrefixes(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, lines, i, filePath, blueprintPrefixes);
      if (parsed) {
        endpoints.push(...parsed);
      }
    }

    return endpoints;
  }

  private parseLine(
    line: string,
    allLines: string[],
    lineIndex: number,
    filePath?: string,
    blueprintPrefixes?: Map<string, string>,
  ): Endpoint[] | null {
    const trimmed = line.trim();

    // Match: @identifier.route('/path', methods=['GET', 'POST'])
    const routeMatch = trimmed.match(
      /@(\w+)\.route\s*\(\s*['"]([^'"]+)['"]/,
    );
    if (routeMatch) {
      const [, identifier, path] = routeMatch;
      const methods = this.extractMethods(trimmed);
      const handler = this.extractHandler(allLines, lineIndex);
      const prefix = blueprintPrefixes?.get(identifier) ?? "";
      const fullPath = this.normalizePath(prefix + path);
      const params = this.extractParams(path);

      return methods.map((method) => ({
        method,
        path: fullPath.replace(/<\w+:(\w+)>/g, ":$1").replace(/<(\w+)>/g, ":$1"),
        handler,
        params,
        file: filePath,
        line: lineIndex + 1,
      }));
    }

    // Match shorthand: @app.get('/path'), @app.post('/path'), etc.
    const shorthandPattern = new RegExp(
      `@(\\w+)\\.(${HTTP_METHODS.map((m) => m.toLowerCase()).join("|")})\\s*\\(\\s*['"]([^'"]+)['"]`,
      "i",
    );
    const shorthandMatch = trimmed.match(shorthandPattern);
    if (shorthandMatch) {
      const [, identifier, method, path] = shorthandMatch;
      const handler = this.extractHandler(allLines, lineIndex);
      const prefix = blueprintPrefixes?.get(identifier) ?? "";
      const fullPath = this.normalizePath(prefix + path);
      const params = this.extractParams(path);

      return [{
        method: method.toUpperCase() as HttpMethod,
        path: fullPath.replace(/<\w+:(\w+)>/g, ":$1").replace(/<(\w+)>/g, ":$1"),
        handler,
        params,
        file: filePath,
        line: lineIndex + 1,
      }];
    }

    return null;
  }

  private extractMethods(line: string): HttpMethod[] {
    // Look for methods=['GET', 'POST'] or methods=["GET"]
    const methodsMatch = line.match(/methods\s*=\s*\[([^\]]+)\]/);
    if (methodsMatch) {
      const methodsStr = methodsMatch[1];
      return methodsStr
        .split(",")
        .map((m) => m.trim().replace(/['"]/g, "").toUpperCase())
        .filter((m): m is HttpMethod =>
          HTTP_METHODS.includes(m as (typeof HTTP_METHODS)[number]),
        );
    }
    // Default to GET if no methods specified
    return ["GET"];
  }

  private extractHandler(lines: string[], decoratorIndex: number): string {
    for (let i = decoratorIndex + 1; i < Math.min(decoratorIndex + 5, lines.length); i++) {
      const defMatch = lines[i].match(/^\s*(?:async\s+)?def\s+(\w+)/);
      if (defMatch) return defMatch[1];
    }
    return "<unknown>";
  }

  private extractParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];

    // Flask typed params: <int:id>, <string:name>
    const typedPattern = /<(\w+):(\w+)>/g;
    let match: RegExpExecArray | null;
    while ((match = typedPattern.exec(path)) !== null) {
      params.push({
        name: match[2],
        location: "path",
        type: this.mapFlaskType(match[1]),
        required: true,
      });
    }

    // Flask simple params: <name>
    const simplePattern = /<(\w+)>/g;
    while ((match = simplePattern.exec(path)) !== null) {
      if (!params.some((p) => p.name === match![1])) {
        params.push({
          name: match[1],
          location: "path",
          type: "string",
          required: true,
        });
      }
    }

    return params;
  }

  private mapFlaskType(flaskType: string): string {
    switch (flaskType) {
      case "int":
        return "number";
      case "float":
        return "number";
      case "string":
        return "string";
      case "path":
        return "string";
      case "uuid":
        return "string";
      default:
        return "string";
    }
  }

  private detectBlueprintPrefixes(source: string): Map<string, string> {
    const prefixes = new Map<string, string>();

    // Match: bp = Blueprint('name', __name__, url_prefix='/prefix')
    const bpPattern = /(\w+)\s*=\s*Blueprint\s*\([^)]*url_prefix\s*=\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = bpPattern.exec(source)) !== null) {
      prefixes.set(match[1], match[2]);
    }

    return prefixes;
  }

  private normalizePath(path: string): string {
    if (!path || path === "") return "/";
    let normalized = path.replace(/\/+/g, "/");
    if (!normalized.startsWith("/")) normalized = "/" + normalized;
    return normalized;
  }
}
