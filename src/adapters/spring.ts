import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

/**
 * Parses Spring Boot / Spring MVC route definitions from Java source code.
 *
 * Handles patterns like:
 *   @GetMapping("/path")
 *   @PostMapping("/path")
 *   @RequestMapping(value = "/path", method = RequestMethod.GET)
 *   @RequestMapping(method = RequestMethod.POST, value = "/path")
 *   @PathVariable annotations
 *   Class-level @RequestMapping("/prefix") — including multiline annotations
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
    // Handle both @GetMapping("/path") and @GetMapping(value = "/path")
    const specificMatch = trimmed.match(
      /@(Get|Post|Put|Delete|Patch|Head|Options)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]/,
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

    // Also match no-arg form: @GetMapping or @GetMapping() without path
    const simpleSpecificMatch = trimmed.match(
      /@(Get|Post|Put|Delete|Patch|Head|Options)Mapping\s*(?:\(\s*\))?\s*$/,
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

    // Try @RequestMapping — handle multiple argument orderings and multiline
    if (trimmed.match(/@RequestMapping\s*\(/)) {
      // Check if this is a class-level annotation (skip it)
      const afterAnnotation = allLines.slice(lineIndex + 1, lineIndex + 5).join(" ");
      if (afterAnnotation.match(/(?:public\s+)?(?:abstract\s+)?class\s+/)) {
        return null;
      }

      // Collect full annotation text (may span multiple lines)
      let annotationText = trimmed;
      let openParens = 0;
      for (const c of annotationText) {
        if (c === "(") openParens++;
        if (c === ")") openParens--;
      }
      let j = lineIndex + 1;
      while (openParens > 0 && j < Math.min(lineIndex + 10, allLines.length)) {
        annotationText += " " + allLines[j].trim();
        for (const c of allLines[j]) {
          if (c === "(") openParens++;
          if (c === ")") openParens--;
        }
        j++;
      }

      // Extract path and method from the full annotation
      const path = this.extractAnnotationPath(annotationText);
      const method = this.extractAnnotationMethod(annotationText);

      if (method) {
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
    }

    return null;
  }

  /**
   * Extract the path from a @RequestMapping annotation text.
   */
  private extractAnnotationPath(text: string): string {
    // Try value = "/path"
    const valueMatch = text.match(/value\s*=\s*['"]([^'"]*)['"]/);
    if (valueMatch) return valueMatch[1];

    // Try first string argument: @RequestMapping("/path", ...)
    const directMatch = text.match(/@RequestMapping\s*\(\s*['"]([^'"]*)['"]/);
    if (directMatch) return directMatch[1];

    return "";
  }

  /**
   * Extract the HTTP method from a @RequestMapping annotation text.
   */
  private extractAnnotationMethod(text: string): HttpMethod | null {
    const methodMatch = text.match(/method\s*=\s*RequestMethod\.(\w+)/);
    if (methodMatch) return methodMatch[1].toUpperCase() as HttpMethod;
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
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.match(/@RequestMapping\s*\(/)) {
        // Check if the next few lines contain a class declaration
        const nextLines = lines.slice(i + 1, i + 5).join(" ");
        if (nextLines.match(/(?:public\s+)?(?:abstract\s+)?class\s+/)) {
          // Collect full annotation if multiline
          let annotationText = trimmed;
          let openParens = 0;
          for (const c of annotationText) {
            if (c === "(") openParens++;
            if (c === ")") openParens--;
          }
          let j = i + 1;
          while (openParens > 0 && j < Math.min(i + 5, lines.length)) {
            annotationText += " " + lines[j].trim();
            for (const c of lines[j]) {
              if (c === "(") openParens++;
              if (c === ")") openParens--;
            }
            j++;
          }

          const pathMatch = annotationText.match(
            /@RequestMapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]/,
          );
          if (pathMatch) return pathMatch[1];
        }
      }
    }
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
