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

    // Detect MethodView classes and their methods
    const methodViews = this.detectMethodViews(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, lines, i, filePath, blueprintPrefixes);
      if (parsed) {
        endpoints.push(...parsed);
        continue;
      }

      // Try add_url_rule() pattern
      const addUrlRuleParsed = this.parseAddUrlRule(
        line, lines, i, filePath, blueprintPrefixes, methodViews,
      );
      if (addUrlRuleParsed) {
        endpoints.push(...addUrlRuleParsed);
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

  /**
   * Parse app.add_url_rule('/path', 'endpoint', view_func, methods=['GET', 'POST'])
   * Also handles: app.add_url_rule('/path', view_func=MyView.as_view('name'))
   */
  private parseAddUrlRule(
    line: string,
    allLines: string[],
    lineIndex: number,
    filePath?: string,
    blueprintPrefixes?: Map<string, string>,
    methodViews?: Map<string, HttpMethod[]>,
  ): Endpoint[] | null {
    const trimmed = line.trim();

    // Match: identifier.add_url_rule('/path', ...)
    const addUrlMatch = trimmed.match(
      /(\w+)\.add_url_rule\s*\(\s*['"]([^'"]+)['"]/,
    );
    if (!addUrlMatch) return null;

    const [, identifier, path] = addUrlMatch;
    const prefix = blueprintPrefixes?.get(identifier) ?? "";
    const fullPath = this.normalizePath(prefix + path);
    const params = this.extractParams(path);
    const normalizedPath = fullPath.replace(/<\w+:(\w+)>/g, ":$1").replace(/<(\w+)>/g, ":$1");

    // Collect the full statement (may span multiple lines)
    let fullStatement = trimmed;
    if (!trimmed.includes(")")) {
      for (let j = lineIndex + 1; j < Math.min(lineIndex + 10, allLines.length); j++) {
        fullStatement += " " + allLines[j].trim();
        if (allLines[j].includes(")")) break;
      }
    }

    // Check if it references a MethodView via .as_view('name')
    const asViewMatch = fullStatement.match(/(\w+)\.as_view\s*\(/);
    if (asViewMatch && methodViews) {
      const viewClassName = asViewMatch[1];
      const viewMethods = methodViews.get(viewClassName);
      if (viewMethods && viewMethods.length > 0) {
        return viewMethods.map((method) => ({
          method,
          path: normalizedPath,
          handler: viewClassName,
          params,
          file: filePath,
          line: lineIndex + 1,
        }));
      }
    }

    // Extract methods from methods=[...] in the add_url_rule call
    const methods = this.extractMethods(fullStatement);

    // Try to extract handler name
    let handler = "<unknown>";
    const viewFuncMatch = fullStatement.match(/view_func\s*=\s*(\w+)/);
    if (viewFuncMatch) {
      handler = viewFuncMatch[1];
    } else {
      // Third positional arg pattern: add_url_rule('/path', 'endpoint_name', view_func)
      const positionalMatch = fullStatement.match(
        /add_url_rule\s*\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]*['"]\s*,\s*(\w+)/,
      );
      if (positionalMatch) {
        handler = positionalMatch[1];
      }
    }

    return methods.map((method) => ({
      method,
      path: normalizedPath,
      handler,
      params,
      file: filePath,
      line: lineIndex + 1,
    }));
  }

  /**
   * Detect MethodView subclasses and their HTTP method implementations.
   * class UserView(MethodView):
   *     def get(self): ...
   *     def post(self): ...
   */
  private detectMethodViews(source: string): Map<string, HttpMethod[]> {
    const views = new Map<string, HttpMethod[]>();
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const classMatch = lines[i].match(/^class\s+(\w+)\s*\(.*MethodView.*\)/);
      if (!classMatch) continue;

      const className = classMatch[1];
      const methods: HttpMethod[] = [];

      // Scan indented methods inside the class body
      for (let j = i + 1; j < lines.length; j++) {
        const methodLine = lines[j];
        // Stop if we hit a non-indented line (new class or top-level code)
        if (methodLine.match(/^\S/) && methodLine.trim() !== "") break;

        const defMatch = methodLine.match(
          /^\s+(?:async\s+)?def\s+(get|post|put|delete|patch|head|options)\s*\(\s*self/i,
        );
        if (defMatch) {
          methods.push(defMatch[1].toUpperCase() as HttpMethod);
        }
      }

      views.set(className, methods);
    }

    return views;
  }

  private normalizePath(path: string): string {
    if (!path || path === "") return "/";
    let normalized = path.replace(/\/+/g, "/");
    if (!normalized.startsWith("/")) normalized = "/" + normalized;
    return normalized;
  }
}
