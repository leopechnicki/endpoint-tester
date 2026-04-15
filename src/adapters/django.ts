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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, i, filePath);
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
  ): Endpoint[] | null {
    const trimmed = line.trim();

    // Match: path('route/', view, ...)
    const pathMatch = trimmed.match(
      /path\s*\(\s*['"]([^'"]*)['"]\s*,\s*([\w.]+)/,
    );
    if (pathMatch) {
      const [, route, handler] = pathMatch;
      return this.createEndpointsFromDjangoPath(route, handler, lineIndex, filePath);
    }

    // Match: re_path(r'pattern', view, ...)
    const rePathMatch = trimmed.match(
      /re_path\s*\(\s*r?['"]([^'"]*)['"]\s*,\s*([\w.]+)/,
    );
    if (rePathMatch) {
      const [, route, handler] = rePathMatch;
      return this.createEndpointsFromDjangoPath(route, handler, lineIndex, filePath);
    }

    return null;
  }

  private createEndpointsFromDjangoPath(
    route: string,
    handler: string,
    lineIndex: number,
    filePath?: string,
  ): Endpoint[] {
    // Normalize path
    let normalizedPath = "/" + route.replace(/^\^/, "").replace(/\$$/, "");
    normalizedPath = normalizedPath.replace(/\/+/g, "/");

    // Extract Django path parameters: <type:name> or <name>
    const params = this.extractParams(route);

    // Replace Django param syntax with :param
    normalizedPath = normalizedPath
      .replace(/<\w+:(\w+)>/g, ":$1")
      .replace(/<(\w+)>/g, ":$1")
      .replace(/\(\?P<(\w+)>[^)]*\)/g, ":$1");

    // Extract handler short name
    const handlerName = handler.includes(".")
      ? handler.split(".").pop()!
      : handler;

    // Django URLs don't specify HTTP method — default to GET
    // ViewSets may support multiple methods, but we parse the URL config
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
