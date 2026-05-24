import type { Endpoint, EndpointParam, HttpMethod } from "./types.js";

/**
 * Options for generating an OpenAPI document from discovered endpoints.
 */
export interface OpenApiOptions {
  /** Server base URL, emitted under `servers`. */
  baseUrl?: string;
  /** `info.title` (default: "API"). */
  title?: string;
  /** `info.version` (default: "1.0.0"). */
  version?: string;
  /** Serialization format (default: "json"). */
  format?: "json" | "yaml";
}

/** Expected success status per HTTP method — mirrors the test generator. */
const METHOD_SUCCESS_STATUS: Record<HttpMethod, number> = {
  GET: 200,
  POST: 201,
  PUT: 200,
  PATCH: 200,
  DELETE: 204,
  HEAD: 200,
  OPTIONS: 200,
};

type JsonSchema = Record<string, unknown>;

/**
 * Generate an OpenAPI 3.1 document from endpoints discovered by the scanner.
 *
 * Output is valid OpenAPI 3.1 (a JSON Schema dialect), consumable by Swagger UI,
 * Schemathesis, Dredd, Apidog, openapi-generator, and Postman import. JSON is the
 * canonical output; YAML is emitted by an internal serializer (zero runtime deps).
 */
export class OpenApiGenerator {
  /**
   * Build the OpenAPI document and serialize it to a string.
   */
  generate(endpoints: Endpoint[], options: OpenApiOptions = {}): string {
    const doc = this.buildDocument(endpoints, options);
    return options.format === "yaml" ? toYaml(doc) : JSON.stringify(doc, null, 2);
  }

  /**
   * Build the OpenAPI document as a plain object (useful programmatically).
   */
  buildDocument(endpoints: Endpoint[], options: OpenApiOptions = {}): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const ep of endpoints) {
      const pathKey = normalizePath(ep.path);
      const pathItem = (paths[pathKey] ??= {});
      pathItem[ep.method.toLowerCase()] = this.buildOperation(ep);
    }

    const doc: Record<string, unknown> = {
      openapi: "3.1.0",
      info: {
        title: options.title ?? "API",
        version: options.version ?? "1.0.0",
      },
    };

    if (options.baseUrl) {
      doc.servers = [{ url: options.baseUrl }];
    }

    doc.paths = paths;
    return doc;
  }

  private buildOperation(ep: Endpoint): Record<string, unknown> {
    const op: Record<string, unknown> = {
      operationId: isUsableOperationId(ep.handler) ? ep.handler : defaultOperationId(ep),
      summary: `${ep.method} ${ep.path}`,
    };

    const parameters = ep.params
      .filter((p) => p.location === "path" || p.location === "query" || p.location === "header")
      .map((p) => buildParameter(p));
    if (parameters.length > 0) {
      op.parameters = parameters;
    }

    if (hasBody(ep) && ep.body?.fields && Object.keys(ep.body.fields).length > 0) {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: objectSchema(ep.body.fields),
          },
        },
      };
    }

    op.responses = buildResponses(ep);
    return op;
  }
}

/** Normalize framework-specific path params to OpenAPI `{name}` style. */
function normalizePath(path: string): string {
  return path
    .replace(/<(?:[^:>]+:)?([A-Za-z0-9_]+)>/g, "{$1}") // Flask/Django  <int:id> | <id>  (before :id rule)
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}"); // Express/NestJS  :id
}

/** A handler name is a usable operationId only if it's a plain identifier. */
function isUsableOperationId(handler: string | undefined): handler is string {
  return typeof handler === "string" && /^[A-Za-z_$][\w$]*$/.test(handler);
}

function defaultOperationId(ep: Endpoint): string {
  const slug = ep.path
    .replace(/[/{}<>:]/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return `${ep.method.toLowerCase()}_${slug || "root"}`;
}

function hasBody(ep: Endpoint): boolean {
  return ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH";
}

function buildParameter(p: EndpointParam): Record<string, unknown> {
  return {
    name: p.name,
    in: p.location,
    required: p.location === "path" ? true : (p.required ?? false),
    schema: typeToSchema(p.type),
  };
}

function buildResponses(ep: Endpoint): Record<string, unknown> {
  const status = METHOD_SUCCESS_STATUS[ep.method] ?? 200;
  const response: Record<string, unknown> = {
    description: status === 204 ? "No Content" : "Successful response",
  };

  if (status !== 204 && ep.response?.fields && Object.keys(ep.response.fields).length > 0) {
    const objSchema = objectSchema(ep.response.fields);
    const schema = ep.response.isArray ? { type: "array", items: objSchema } : objSchema;
    response.content = { "application/json": { schema } };
  }

  return { [String(status)]: response };
}

function objectSchema(fields: Record<string, string>): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const [name, type] of Object.entries(fields)) {
    properties[name] = typeToSchema(type);
  }
  return { type: "object", properties };
}

function typeToSchema(type?: string): JsonSchema {
  switch (type) {
    case "number":
    case "float":
      return { type: "number" };
    case "integer":
    case "int":
      return { type: "integer" };
    case "boolean":
    case "bool":
      return { type: "boolean" };
    case "array":
      return { type: "array", items: {} };
    case "object":
      return { type: "object" };
    default:
      return { type: "string" };
  }
}

// --- Minimal YAML serializer (zero-dependency) ---------------------------------
// Handles the controlled shape of an OpenAPI document: nested objects, arrays,
// strings, numbers, booleans, and null. String scalars are emitted as
// double-quoted JSON strings, which are valid YAML, so no escaping edge cases.

/** Serialize a plain JSON-compatible value to YAML. */
export function toYaml(value: unknown): string {
  const lines: string[] = [];
  if (isScalar(value)) {
    lines.push(scalar(value));
  } else if (Array.isArray(value)) {
    emitArray(lines, value, 0);
  } else {
    emitObject(lines, value as Record<string, unknown>, 0);
  }
  return lines.join("\n") + "\n";
}

function isScalar(v: unknown): boolean {
  return v === null || typeof v !== "object";
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  return JSON.stringify(String(v));
}

function yamlKey(key: string): string {
  // Quote anything that isn't a plain identifier — including all-numeric keys
  // (e.g. HTTP status "200"), which OpenAPI requires to be string-typed.
  return /^[A-Za-z_][\w.-]*$/.test(key) ? key : JSON.stringify(key);
}

function emitObject(lines: string[], obj: Record<string, unknown>, indent: number): void {
  const pad = "  ".repeat(indent);
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = yamlKey(k);
    if (isScalar(v)) {
      lines.push(`${pad}${key}: ${scalar(v)}`);
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else {
        lines.push(`${pad}${key}:`);
        emitArray(lines, v, indent);
      }
    } else {
      const child = v as Record<string, unknown>;
      if (Object.keys(child).length === 0) {
        lines.push(`${pad}${key}: {}`);
      } else {
        lines.push(`${pad}${key}:`);
        emitObject(lines, child, indent + 1);
      }
    }
  }
}

function emitArray(lines: string[], arr: unknown[], indent: number): void {
  const pad = "  ".repeat(indent);
  for (const item of arr) {
    if (isScalar(item)) {
      lines.push(`${pad}- ${scalar(item)}`);
    } else if (Array.isArray(item)) {
      lines.push(`${pad}-`);
      emitArray(lines, item, indent + 1);
    } else {
      const obj = item as Record<string, unknown>;
      if (Object.keys(obj).length === 0) {
        lines.push(`${pad}- {}`);
      } else {
        lines.push(`${pad}-`);
        emitObject(lines, obj, indent + 1);
      }
    }
  }
}
