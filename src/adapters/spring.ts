import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

/**
 * Parses Spring Boot / Spring MVC route definitions from Java source code.
 *
 * Handles patterns like:
 *   @GetMapping("/path")
 *   @PostMapping("/path")
 *   @RequestMapping(value = "/path", method = RequestMethod.GET)
 *   @PathVariable annotations
 *   Class-level @RequestMapping("/prefix")
 */
export class SpringAdapter implements Adapter {
  readonly framework = Framework.Spring;
  readonly fileExtensions = [".java", ".kt"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect class-level @RequestMapping prefix
    const classPrefix = this.detectClassPrefix(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = this.parseLine(line, lines, i, classPrefix, filePath);
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
    classPrefix: string,
    filePath?: string,
  ): Endpoint[] | null {
    const trimmed = line.trim();

    // Try specific mapping annotations first: @GetMapping, @PostMapping, etc.
    const specificMatch = trimmed.match(
      /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]/,
    );
    if (specificMatch) {
      const [, methodStr, path] = specificMatch;
      const method = methodStr.toUpperCase() as HttpMethod;
      const fullPath = this.normalizePath(classPrefix + path);
      const handler = this.extractHandler(allLines, lineIndex);
      const params = this.extractParams(fullPath);

      return [{
        method,
        path: fullPath.replace(/\{(\w+)\}/g, ":$1"),
        handler,
        params,
        file: filePath,
        line: lineIndex + 1,
      }];
    }

    // Also match no-arg form: @GetMapping or @GetMapping("/path") without value=
    const simpleSpecificMatch = trimmed.match(
      /@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*\))?\s*$/,
    );
    if (simpleSpecificMatch) {
      const [, methodStr] = simpleSpecificMatch;
      const method = methodStr.toUpperCase() as HttpMethod;
      const fullPath = this.normalizePath(classPrefix || "/");
      const handler = this.extractHandler(allLines, lineIndex);

      return [{
        method,
        path: fullPath,
        handler,
        params: [],
        file: filePath,
        line: lineIndex + 1,
      }];
    }

    // Try @RequestMapping with method
    const requestMappingMatch = trimmed.match(
      /@RequestMapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]\s*,\s*method\s*=\s*RequestMethod\.(\w+)/,
    );
    if (requestMappingMatch) {
      const [, path, method] = requestMappingMatch;
      const fullPath = this.normalizePath(classPrefix + path);
      const handler = this.extractHandler(allLines, lineIndex);
      const params = this.extractParams(fullPath);

      return [{
        method: method.toUpperCase() as HttpMethod,
        path: fullPath.replace(/\{(\w+)\}/g, ":$1"),
        handler,
        params,
        file: filePath,
        line: lineIndex + 1,
      }];
    }

    return null;
  }

  private extractHandler(lines: string[], annotationIndex: number): string {
    // Look for method declaration after annotation
    for (let i = annotationIndex + 1; i < Math.min(annotationIndex + 5, lines.length); i++) {
      const methodMatch = lines[i].match(/(?:public|private|protected)?\s+\w+\s+(\w+)\s*\(/);
      if (methodMatch) return methodMatch[1];

      // Kotlin: fun functionName(
      const ktMatch = lines[i].match(/fun\s+(\w+)\s*\(/);
      if (ktMatch) return ktMatch[1];
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

  private detectClassPrefix(source: string): string {
    // Match class-level @RequestMapping("/prefix")
    // Must appear before any class method definitions
    const classAnnotation = source.match(
      /@RequestMapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]\s*\)\s*\n\s*(?:public\s+)?class/,
    );
    if (classAnnotation) return classAnnotation[1];

    return "";
  }

  private normalizePath(path: string): string {
    if (!path || path === "") return "/";
    // Remove double slashes
    let normalized = path.replace(/\/+/g, "/");
    // Ensure leading slash
    if (!normalized.startsWith("/")) normalized = "/" + normalized;
    // Remove trailing slash (unless it's just "/")
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
}
