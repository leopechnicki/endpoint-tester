import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

/**
 * Parses Django URL patterns from Python source code.
 *
 * Handles patterns like:
 *   path('users/', views.user_list, name='user-list')
 *   path('users/<int:pk>/', views.user_detail)
 *   re_path(r'^items/(?P<id>\d+)/$', views.item_detail)
 */
export class DjangoAdapter implements Adapter {
  readonly framework = Framework.Django;
  readonly fileExtensions = [".py"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect view classes and their HTTP methods from the same file
    const viewMethods = this.detectViewMethods(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, i, filePath, viewMethods);
      if (parsed) {
        endpoints.push(...parsed);
      }
    }

    return endpoints;
  }

  private parseLine(
    line: string,
    lineIndex: number,
    filePath?: string,
    viewMethods?: Map<string, HttpMethod[]>,
  ): Endpoint[] | null {
    const trimmed = line.trim();

    // Match: path('route/', view, ...)
    const pathMatch = trimmed.match(
      /path\s*\(\s*['"]([^'"]*)['"]\s*,\s*([\w.]+)/,
    );
    if (pathMatch) {
      const [, route, handler] = pathMatch;
      return this.createEndpointsFromDjangoPath(route, handler, lineIndex, filePath, viewMethods);
    }

    // Match: re_path(r'pattern', view, ...)
    const rePathMatch = trimmed.match(
      /re_path\s*\(\s*r?['"]([^'"]*)['"]\s*,\s*([\w.]+)/,
    );
    if (rePathMatch) {
      const [, route, handler] = rePathMatch;
      return this.createEndpointsFromDjangoPath(route, handler, lineIndex, filePath, viewMethods);
    }

    return null;
  }

  private createEndpointsFromDjangoPath(
    route: string,
    handler: string,
    lineIndex: number,
    filePath?: string,
    viewMethods?: Map<string, HttpMethod[]>,
  ): Endpoint[] {
    // Normalize path
    let normalizedPath = "/" + route.replace(/^\^/, "").replace(/\$$/, "");
    normalizedPath = normalizedPath.replace(/\/+/g, "/");

    // Extract Django path parameters: <type:name> or <name>
    const params = this.extractParams(route);

    // Replace Django param syntax with :param
    // Named groups (?P<name>...) must be replaced first, before <name> patterns
    normalizedPath = normalizedPath
      .replace(/\(\?P<(\w+)>[^)]*\)/g, ":$1")
      .replace(/<\w+:(\w+)>/g, ":$1")
      .replace(/<(\w+)>/g, ":$1");

    // Extract handler short name (strip .as_view suffix)
    const cleanHandler = handler.replace(/\.as_view$/, "");
    const handlerName = cleanHandler.includes(".")
      ? cleanHandler.split(".").pop()!
      : cleanHandler;

    // Check if handler references a view class with .as_view()
    // Also check viewMethods map for class-based views
    // Handler may be "UserView.as_view" (parens cut by regex) or "UserView"
    const viewClassName = handler.replace(/\.as_view$/, "")
      .replace(/\.as_view\s*\(.*\)/, "")
      .split(".").pop()!;

    const inferredMethods = viewMethods?.get(viewClassName);
    if (inferredMethods && inferredMethods.length > 0) {
      return inferredMethods.map((method) => ({
        method,
        path: normalizedPath,
        handler: handlerName,
        params,
        file: filePath,
        line: lineIndex + 1,
      }));
    }

    // Default to GET if we can't infer methods
    return [{
      method: "GET" as HttpMethod,
      path: normalizedPath,
      handler: handlerName,
      params,
      file: filePath,
      line: lineIndex + 1,
    }];
  }

  private extractParams(route: string): EndpointParam[] {
    const params: EndpointParam[] = [];

    // Django typed params: <int:pk>, <str:slug>, <uuid:id>
    const typedPattern = /<(\w+):(\w+)>/g;
    let match: RegExpExecArray | null;
    while ((match = typedPattern.exec(route)) !== null) {
      params.push({
        name: match[2],
        location: "path",
        type: this.mapDjangoType(match[1]),
        required: true,
      });
    }

    // Django simple params: <pk>
    const simplePattern = /<(\w+)>/g;
    while ((match = simplePattern.exec(route)) !== null) {
      // Skip if already captured as typed param
      if (!params.some((p) => p.name === match![1])) {
        params.push({
          name: match[1],
          location: "path",
          type: "string",
          required: true,
        });
      }
    }

    // Regex named groups: (?P<name>pattern)
    const namedGroupPattern = /\(\?P<(\w+)>[^)]*\)/g;
    while ((match = namedGroupPattern.exec(route)) !== null) {
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

  /**
   * Detect class-based views and their HTTP method implementations.
   * Also detects @api_view and @require_http_methods decorators on functions.
   *
   * class UserView(APIView):
   *     def get(self): ...
   *     def post(self): ...
   *
   * @api_view(['GET', 'POST'])
   * def user_list(request): ...
   *
   * @require_http_methods(["GET", "POST"])
   * def my_view(request): ...
   */
  private detectViewMethods(source: string): Map<string, HttpMethod[]> {
    const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
    const views = new Map<string, HttpMethod[]>();
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      // Detect class-based views (APIView, View, MethodView, ViewSet, etc.)
      const classMatch = lines[i].match(
        /^class\s+(\w+)\s*\(([^)]*(?:View|ViewSet|Mixin)[^)]*)\)/,
      );
      if (classMatch) {
        const className = classMatch[1];
        const bases = classMatch[2];
        const methods: HttpMethod[] = [];

        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^\S/) && lines[j].trim() !== "") break;
          const defMatch = lines[j].match(
            /^\s+(?:async\s+)?def\s+(get|post|put|delete|patch|head|options|list|create|retrieve|update|partial_update|destroy)\s*\(\s*self/i,
          );
          if (defMatch) {
            const methodName = defMatch[1].toLowerCase();
            const mapped = this.mapViewSetMethodToHttp(methodName);
            if (mapped && !methods.includes(mapped)) {
              methods.push(mapped);
            }
          }
        }

        // If no explicit methods found, infer from base classes
        if (methods.length === 0) {
          const inferredFromBases = this.inferMethodsFromBases(bases);
          methods.push(...inferredFromBases);
        }

        if (methods.length > 0) {
          views.set(className, methods);
        }
        continue;
      }

      // Detect @api_view(['GET', 'POST']) or @require_http_methods(["GET", "POST"])
      const decoratorMatch = lines[i].match(
        /^\s*@(?:api_view|require_http_methods)\s*\(\s*\[([^\]]+)\]/,
      );
      if (decoratorMatch) {
        const methodsStr = decoratorMatch[1];
        const methods = methodsStr
          .split(",")
          .map((m) => m.trim().replace(/['"]/g, "").toUpperCase())
          .filter((m): m is HttpMethod => HTTP_METHODS.includes(m));

        // Find the function name on the next def line
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const defMatch = lines[j].match(/^\s*(?:async\s+)?def\s+(\w+)/);
          if (defMatch) {
            views.set(defMatch[1], methods);
            break;
          }
        }
      }
    }

    return views;
  }

  private mapViewSetMethodToHttp(methodName: string): HttpMethod | null {
    const map: Record<string, HttpMethod> = {
      get: "GET",
      post: "POST",
      put: "PUT",
      delete: "DELETE",
      patch: "PATCH",
      head: "HEAD",
      options: "OPTIONS",
      list: "GET",
      create: "POST",
      retrieve: "GET",
      update: "PUT",
      partial_update: "PATCH",
      destroy: "DELETE",
    };
    return map[methodName] ?? null;
  }

  private inferMethodsFromBases(bases: string): HttpMethod[] {
    const basesLower = bases.toLowerCase();

    // ReadOnlyModelViewSet must be checked before ModelViewSet
    if (basesLower.includes("readonlymodelviewset")) {
      return ["GET"];
    }
    // ModelViewSet = full CRUD
    if (basesLower.includes("modelviewset")) {
      return ["GET", "POST", "PUT", "PATCH", "DELETE"];
    }

    const methods: HttpMethod[] = [];
    // DRF mixin class names: CreateModelMixin, ListModelMixin, etc.
    if (basesLower.includes("createmodelmixin") || basesLower.includes("createapiview")) {
      methods.push("POST");
    }
    if (basesLower.includes("listmodelmixin") || basesLower.includes("retrievemodelmixin") || basesLower.includes("listapiview") || basesLower.includes("retrieveapiview")) {
      if (!methods.includes("GET")) methods.push("GET");
    }
    if (basesLower.includes("updatemodelmixin") || basesLower.includes("updateapiview")) {
      methods.push("PUT");
      methods.push("PATCH");
    }
    if (basesLower.includes("destroymodelmixin") || basesLower.includes("destroyapiview")) {
      methods.push("DELETE");
    }
    return methods;
  }

  private mapDjangoType(djangoType: string): string {
    switch (djangoType) {
      case "int":
        return "number";
      case "str":
        return "string";
      case "slug":
        return "string";
      case "uuid":
        return "string";
      case "path":
        return "string";
      default:
        return "string";
    }
  }
}
