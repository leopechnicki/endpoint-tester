import type { Adapter, Endpoint, EndpointParam, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

/**
 * Parses NestJS route definitions from source code.
 *
 * Handles patterns like:
 *   @Get('/path')
 *   @Post('/path')
 *   @Controller('/prefix')
 *   @Param('id') id: string
 *   @Query('search') search: string
 *   @Body() body: CreateDto
 *   Route parameters like :id
 */
export class NestJSAdapter implements Adapter {
  readonly framework = Framework.NestJS;
  readonly fileExtensions = [".ts", ".js"];

  parse(source: string, filePath?: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const lines = source.split("\n");

    // Detect class-level @Controller('/prefix')
    const controllerPrefix = this.detectControllerPrefix(source);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match @Get(), @Post(), @Put(), @Delete(), @Patch(), @Head(), @Options()
      const decoratorMatch = line.match(
        /^@(Get|Post|Put|Delete|Patch|Head|Options)\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/i,
      );
      if (!decoratorMatch) continue;

      const method = decoratorMatch[1].toUpperCase() as HttpMethod;
      const path = decoratorMatch[2] ?? "";

      // Build full path with controller prefix
      let fullPath = controllerPrefix ? controllerPrefix + (path ? "/" + path : "") : (path || "/");
      // Normalize: remove double slashes, ensure leading slash
      fullPath = "/" + fullPath.replace(/^\/+/, "").replace(/\/+/g, "/");
      if (fullPath !== "/" && fullPath.endsWith("/")) {
        fullPath = fullPath.slice(0, -1);
      }

      // Look at the method signature (next non-decorator lines)
      const methodInfo = this.parseMethodSignature(lines, i + 1);

      const params: EndpointParam[] = [
        ...this.extractPathParams(fullPath),
        ...methodInfo.queryParams,
      ];

      const endpoint: Endpoint = {
        method,
        path: fullPath,
        handler: methodInfo.handlerName,
        params,
        file: filePath,
        line: i + 1,
      };

      if (methodInfo.bodyFields && Object.keys(methodInfo.bodyFields).length > 0) {
        endpoint.body = { type: "object", fields: methodInfo.bodyFields };
      } else if (methodInfo.hasBody) {
        endpoint.body = { type: "object", fields: {} };
      }

      endpoints.push(endpoint);
    }

    // Post-process: infer response fields from return statements
    this.inferResponseFields(source, endpoints);

    return endpoints;
  }

  private detectControllerPrefix(source: string): string {
    const match = source.match(/@Controller\s*\(\s*['"]([^'"]*)['"]\s*\)/);
    if (!match) return "";
    return match[1];
  }

  private parseMethodSignature(
    lines: string[],
    startIndex: number,
  ): {
    handlerName: string;
    queryParams: EndpointParam[];
    bodyFields: Record<string, string> | null;
    hasBody: boolean;
  } {
    let handlerName = "<unknown>";
    const queryParams: EndpointParam[] = [];
    let bodyFields: Record<string, string> | null = null;
    let hasBody = false;

    // Scan lines after decorator to find method signature
    for (let i = startIndex; i < Math.min(startIndex + 10, lines.length); i++) {
      const line = lines[i].trim();

      // Skip other decorators
      if (line.startsWith("@") && !line.match(/^@(Param|Query|Body|Headers)/)) continue;

      // @Query('name') name: type — can appear multiple times on one line
      const queryPattern = /@Query\s*\(\s*['"](\w+)['"]\s*\)\s*\w+\s*:\s*(\w+)/g;
      let queryMatch: RegExpExecArray | null;
      let foundQuery = false;
      while ((queryMatch = queryPattern.exec(line)) !== null) {
        queryParams.push({
          name: queryMatch[1],
          location: "query",
          type: this.mapNestType(queryMatch[2]),
        });
        foundQuery = true;
      }
      if (foundQuery) continue;

      // @Query() without specific param - destructured
      if (line.match(/@Query\s*\(\s*\)/)) {
        // Try to find type from parameter: @Query() query: SomeDto
        const typeMatch = line.match(/@Query\s*\(\s*\)\s*\w+\s*:\s*(\w+)/);
        if (typeMatch) {
          // Try to find the DTO class definition
          const dtoFields = this.findDtoFields(lines.join("\n"), typeMatch[1]);
          for (const [name, type] of Object.entries(dtoFields)) {
            queryParams.push({ name, location: "query", type });
          }
        }
        continue;
      }

      // @Body() body: CreateDto
      const bodyMatch = line.match(/@Body\s*\(\s*\)\s*\w+\s*:\s*(\w+)/);
      if (bodyMatch) {
        hasBody = true;
        bodyFields = this.findDtoFields(lines.join("\n"), bodyMatch[1]);
        continue;
      }

      // @Body('field') - partial body
      if (line.match(/@Body\s*\(/)) {
        hasBody = true;
        continue;
      }

      // Method name: async methodName(...) or methodName(...)
      const methodMatch = line.match(/(?:async\s+)?(\w+)\s*\(/);
      if (methodMatch && !line.startsWith("@")) {
        handlerName = methodMatch[1];
        break;
      }
    }

    return { handlerName, queryParams, bodyFields, hasBody };
  }

  /**
   * Find DTO/class field definitions in source.
   * Matches: fieldName: type; or @IsString() fieldName: string;
   */
  private findDtoFields(source: string, dtoName: string): Record<string, string> {
    const fields: Record<string, string> = {};

    // Find class definition: class DtoName { ... }
    const classPattern = new RegExp(
      `class\\s+${this.escapeRegex(dtoName)}[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`,
    );
    const classMatch = source.match(classPattern);
    if (!classMatch) return fields;

    const classBody = classMatch[1];
    // Match field declarations: fieldName: type; or fieldName?: type;
    // Simple line-by-line matching to avoid complex regex issues
    const bodyLines = classBody.split("\n");
    for (const bodyLine of bodyLines) {
      const trimmed = bodyLine.trim();
      // Skip decorators, empty lines, comments
      if (!trimmed || trimmed.startsWith("@") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
      // Match: fieldName: Type or fieldName?: Type
      const fieldMatch = trimmed.match(/^(\w+)\??\s*:\s*(\w+)/);
      if (fieldMatch) {
        fields[fieldMatch[1]] = this.mapNestType(fieldMatch[2]);
      }
    }

    return fields;
  }

  private mapNestType(tsType: string): string {
    switch (tsType.toLowerCase()) {
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "string":
        return "string";
      default:
        return "string";
    }
  }

  private extractPathParams(path: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    const paramPattern = /:(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = paramPattern.exec(path)) !== null) {
      params.push({ name: match[1], location: "path", type: "string", required: true });
    }
    return params;
  }

  private inferResponseFields(source: string, endpoints: Endpoint[]): void {
    for (const ep of endpoints) {
      if (!ep.line) continue;
      const lines = source.split("\n");
      const startLine = ep.line - 1;
      const endLine = Math.min(startLine + 30, lines.length);
      const block = lines.slice(startLine, endLine).join("\n");

      // return { field: value } or return this.service.method()
      const returnMatch = block.match(/return\s+\{([^}]*)\}/);
      if (returnMatch) {
        const fields: Record<string, string> = {};
        const keyPattern = /(\w+)\s*:/g;
        let keyMatch: RegExpExecArray | null;
        while ((keyMatch = keyPattern.exec(returnMatch[1])) !== null) {
          fields[keyMatch[1]] = "string";
        }
        if (Object.keys(fields).length > 0) {
          ep.response = { fields };
        }
      }
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
