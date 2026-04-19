export enum Framework {
  Express = "express",
  FastAPI = "fastapi",
  Spring = "spring",
  Django = "django",
  Flask = "flask",
  Fastify = "fastify",
  Koa = "koa",
  NestJS = "nestjs",
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export interface EndpointParam {
  name: string;
  location: "path" | "query" | "header";
  type?: string;
  required?: boolean;
}

export interface EndpointBody {
  type?: string;
  fields?: Record<string, string>;
}

export interface EndpointResponse {
  status?: number;
  type?: string;
  /** Known response fields (inferred from source) */
  fields?: Record<string, string>;
  /** Whether response is an array */
  isArray?: boolean;
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  handler: string;
  params: EndpointParam[];
  body?: EndpointBody;
  response?: EndpointResponse;
  file?: string;
  line?: number;
}

export interface Adapter {
  framework: Framework;
  /** File extensions this adapter scans (e.g. [".ts", ".js"]) */
  fileExtensions: string[];
  /** Parse source code and return discovered endpoints */
  parse(source: string, filePath?: string): Endpoint[];
}

export interface ScanOptions {
  directory: string;
  framework: Framework;
  /** Glob patterns to exclude */
  exclude?: string[];
}

export interface GenerateOptions {
  endpoints: Endpoint[];
  output: string;
  format: "vitest" | "jest" | "pytest";
  baseUrl?: string;
}
