export enum Framework {
  Express = "express",
  FastAPI = "fastapi",
  Spring = "spring",
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
  /** Glob patterns to include */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
}

export interface GenerateOptions {
  endpoints: Endpoint[];
  output: string;
  format: "vitest" | "jest" | "pytest";
  baseUrl?: string;
}
