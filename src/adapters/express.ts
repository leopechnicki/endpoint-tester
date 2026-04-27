import type { Adapter, Endpoint, EndpointParam, EndpointResponse, HttpMethod } from "../types.js";
import { Framework } from "../types.js";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options", "all"] as const;

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
      if (parsed) {
        endpoints.push(...parsed);
        continue;
      }

      // Try regex route pattern: app.get(/^\/files\//, handler)
      const regexParsed = this.parseRegexRoute(line, i + 1, filePath, routerPrefixes);
      if (regexParsed) {
        endpoints.push(...regexParsed);
        continue;
      }

      // Try app.route('/path').get().post() chaining pattern
      const routeChain = this.parseRouteChain(line, lines, i, filePath, routerPrefixes);
      if (routeChain.length > 0) {
        endpoints.push(...routeChain);
      }
    }

    // Post-process: infer body fields and query params from handler code
    this.inferBodyAndQueryFromSource(source, endpoints);

    return endpoints;
  }

  private parseLine(
    line: string,
    lineNumber: number,
    filePath?: string,
    routerPrefixes?: Map<string, string>,
  ): Endpoint[] | null {
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

    // app.all() maps to all standard HTTP methods
    if (method.toLowerCase() === "all") {
      const allMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
      return allMethods.map((m) => ({
        method: m,
        path: fullPath,
        handler,
        params: [...params],
        file: filePath,
        line: lineNumber,
      }));
    }

    return [{
      method: method.toUpperCase() as HttpMethod,
      path: fullPath,
      handler,
      params,
      file: filePath,
      line: lineNumber,
    }];
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
      if (nextLine.match(/^\.(get|post|put|delete|patch|head|options|all)\s*\(/i)) {
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
      const chainedMethod = methodMatch[1].toLowerCase();
      if (chainedMethod === "all") {
        const allMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
        for (const m of allMethods) {
          endpoints.push({
            method: m,
            path: fullPath,
            handler: "<chained>",
            params: [...params],
            file: filePath,
            line: lineIndex + 1,
          });
        }
      } else {
        endpoints.push({
          method: chainedMethod.toUpperCase() as HttpMethod,
          path: fullPath,
          handler: "<chained>",
          params: [...params],
          file: filePath,
          line: lineIndex + 1,
        });
      }
    }

    return endpoints;
  }

  /**
   * Parse regex route patterns: app.get(/^\/files\//, handler)
   */
  private parseRegexRoute(
    line: string,
    lineNumber: number,
    filePath?: string,
    routerPrefixes?: Map<string, string>,
  ): Endpoint[] | null {
    // Match: identifier.method(/regex/, handler)
    // The regex literal sits between ( / ... / , ) — we capture the content between slashes
    const methodsGroup = HTTP_METHODS.join("|");
    const regexMatch = line.match(
      new RegExp(`(\\w+)\\.(${methodsGroup})\\s*\\(\\s*\\/([^\\/]*(?:\\\\\\/[^\\/]*)*)\\/\\s*,`, "i"),
    );
    if (!regexMatch) return null;

    const [, identifier, method, regexContent] = regexMatch;

    // Convert regex to a readable path approximation
    let path = regexContent
      .replace(/\\\//g, "/")     // unescape slashes (\/ → /)
      .replace(/^\^/, "")        // remove start anchor
      .replace(/\$$/, "");       // remove end anchor

    // Ensure leading slash
    if (!path.startsWith("/")) path = "/" + path;

    let fullPath = path;
    if (routerPrefixes && identifier && routerPrefixes.has(identifier)) {
      const prefix = routerPrefixes.get(identifier)!;
      fullPath = prefix + path;
    }

    const handler = this.extractHandler(line);
    const params = this.extractParams(fullPath);

    if (method.toLowerCase() === "all") {
      const allMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
      return allMethods.map((m) => ({
        method: m,
        path: fullPath,
        handler,
        params: [...params],
        file: filePath,
        line: lineNumber,
      }));
    }

    return [{
      method: method.toUpperCase() as HttpMethod,
      path: fullPath,
      handler,
      params: [...params],
      file: filePath,
      line: lineNumber,
    }];
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
   * Infer request body fields from req.body.x / req.body['x'] patterns,
   * query params from req.query.x / req.query['x'] patterns,
   * and response fields from res.json({...}) / res.send({...}) patterns.
   */
  private inferBodyAndQueryFromSource(source: string, endpoints: Endpoint[]): void {
    // Find handler blocks: from route definition to next route or end
    for (const ep of endpoints) {
      if (!ep.line || !ep.file) continue;

      const lines = source.split("\n");
      const startLine = ep.line - 1;
      // Scan up to 50 lines after the route definition to find handler body
      const endLine = Math.min(startLine + 50, lines.length);
      const handlerBlock = lines.slice(startLine, endLine).join("\n");

      // Infer body fields from req.body.field or req.body['field'] or destructuring
      if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
        const bodyFields = this.inferBodyFields(handlerBlock);
        if (Object.keys(bodyFields).length > 0) {
          ep.body = { type: "object", fields: bodyFields };
        }
      }

      // Infer query params from req.query.param or req.query['param']
      const queryParams = this.inferQueryParams(handlerBlock);
      for (const qp of queryParams) {
        // Avoid duplicates
        if (!ep.params.some(p => p.name === qp.name && p.location === "query")) {
          ep.params.push(qp);
        }
      }

      // Infer response fields from res.json({...}) or res.send({...})
      const responseInfo = this.inferResponseFields(handlerBlock);
      if (responseInfo) {
        ep.response = responseInfo;
      }
    }
  }

  private inferBodyFields(handlerBlock: string): Record<string, string> {
    const fields: Record<string, string> = {};

    // Pattern: req.body.fieldName
    const dotPattern = /req\.body\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotPattern.exec(handlerBlock)) !== null) {
      fields[match[1]] = "string"; // default type
    }

    // Pattern: req.body['fieldName'] or req.body["fieldName"]
    const bracketPattern = /req\.body\[['"](\w+)['"]\]/g;
    while ((match = bracketPattern.exec(handlerBlock)) !== null) {
      fields[match[1]] = "string";
    }

    // Pattern: const { field1, field2 } = req.body
    const destructurePattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.body/g;
    while ((match = destructurePattern.exec(handlerBlock)) !== null) {
      const fieldList = match[1].split(",").map(f => f.trim().split(":")[0].split("=")[0].trim());
      for (const field of fieldList) {
        if (field && /^\w+$/.test(field)) {
          fields[field] = "string";
        }
      }
    }

    return fields;
  }

  private inferQueryParams(handlerBlock: string): EndpointParam[] {
    const params: EndpointParam[] = [];
    const seen = new Set<string>();

    // Pattern: req.query.paramName
    const dotPattern = /req\.query\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotPattern.exec(handlerBlock)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({ name: match[1], location: "query", type: "string" });
      }
    }

    // Pattern: req.query['paramName']
    const bracketPattern = /req\.query\[['"](\w+)['"]\]/g;
    while ((match = bracketPattern.exec(handlerBlock)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({ name: match[1], location: "query", type: "string" });
      }
    }

    // Pattern: const { param1, param2 } = req.query
    const destructurePattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.query/g;
    while ((match = destructurePattern.exec(handlerBlock)) !== null) {
      const fieldList = match[1].split(",").map(f => f.trim().split(":")[0].split("=")[0].trim());
      for (const field of fieldList) {
        if (field && /^\w+$/.test(field) && !seen.has(field)) {
          seen.add(field);
          params.push({ name: field, location: "query", type: "string" });
        }
      }
    }

    return params;
  }

  private inferResponseFields(handlerBlock: string): EndpointResponse | null {
    // Pattern: res.json({ field1: ..., field2: ... })
    const jsonPattern = /res\.(?:json|send)\s*\(\s*\{([^}]*)\}/;
    const match = handlerBlock.match(jsonPattern);
    if (!match) return null;

    const fields: Record<string, string> = {};
    const content = match[1];
    // Extract key names from object literal
    const keyPattern = /(\w+)\s*:/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyPattern.exec(content)) !== null) {
      fields[keyMatch[1]] = "string";
    }

    if (Object.keys(fields).length === 0) return null;

    // Check if response is an array: res.json([...]) or res.json(items)
    const arrayPattern = /res\.(?:json|send)\s*\(\s*\[/;
    const isArray = arrayPattern.test(handlerBlock);

    return { fields, isArray };
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
