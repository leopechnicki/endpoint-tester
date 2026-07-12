import type { Endpoint } from './types.js';

/**
 * Options for generating a Postman Collection v2.1 from discovered endpoints.
 */
export interface PostmanOptions {
  /** Collection name (default: "API"). */
  name?: string;
  /** Base URL for requests (default: "http://localhost:3000"). */
  baseUrl?: string;
}

/**
 * Postman Collection v2.1 generator.
 *
 * Converts discovered endpoints into a Postman Collection that can be
 * imported directly into Postman or Newman. The collection includes:
 * - One request per endpoint
 * - Path/query parameters as Postman variables
 * - Request bodies for POST/PUT/PATCH with sample values
 * - Bearer token auth header
 * - Requests grouped by path prefix (folders)
 */
export class PostmanGenerator {
  /**
   * Generate a Postman Collection v2.1 JSON string.
   */
  generate(endpoints: Endpoint[], options: PostmanOptions = {}): string {
    const doc = this.buildCollection(endpoints, options);
    return JSON.stringify(doc, null, 2);
  }

  /**
   * Build the Postman Collection as a plain object.
   */
  buildCollection(
    endpoints: Endpoint[],
    options: PostmanOptions = {}
  ): Record<string, unknown> {
    const name = options.name ?? 'API';
    const baseUrl = options.baseUrl ?? 'http://localhost:3000';

    // Group endpoints by first path segment
    const groups = this.groupByPrefix(endpoints);
    const items: Record<string, unknown>[] = [];

    for (const [prefix, eps] of Object.entries(groups)) {
      const folderItems = eps.map((ep) => this.buildRequest(ep, baseUrl));

      if (Object.keys(groups).length === 1) {
        // Single group -- no need for folders
        items.push(...folderItems);
      } else {
        items.push({
          name: prefix,
          item: folderItems,
        });
      }
    }

    return {
      info: {
        name,
        schema:
          'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: items,
      variable: [
        {
          key: 'baseUrl',
          value: baseUrl,
          type: 'string',
        },
        {
          key: 'authToken',
          value: 'your-token-here',
          type: 'string',
        },
      ],
    };
  }

  private buildRequest(ep: Endpoint, baseUrl: string): Record<string, unknown> {
    const url = this.buildUrl(ep, baseUrl);
    const request: Record<string, unknown> = {
      method: ep.method,
      header: this.buildHeaders(ep),
      url,
    };

    if (this.hasBody(ep) && ep.body?.fields) {
      request.body = {
        mode: 'raw',
        raw: JSON.stringify(this.buildSampleBody(ep), null, 2),
        options: {
          raw: {
            language: 'json',
          },
        },
      };
    }

    const operationName = ep.handler || `${ep.method} ${ep.path}`;

    return {
      name: operationName,
      request,
      response: [],
    };
  }

  private buildUrl(ep: Endpoint, baseUrl: string): Record<string, unknown> {
    let parsedHost: string;
    let parsedProtocol: string;
    let parsedPort: string | undefined;

    try {
      const u = new URL(baseUrl);
      parsedProtocol = u.protocol.replace(':', '');
      parsedHost = u.hostname;
      parsedPort = u.port || (u.protocol === 'https:' ? '443' : '80');
    } catch {
      parsedProtocol = 'http';
      parsedHost = 'localhost';
      parsedPort = '3000';
    }

    // Convert :param to Postman {{param}} for path display,
    // but use :param in the path array for Postman variable resolution
    const pathSegments = ep.path
      .split('/')
      .filter(Boolean)
      .map((seg) => {
        if (seg.startsWith(':')) {
          return `:${seg.slice(1)}`;
        }
        return seg;
      });

    const url: Record<string, unknown> = {
      raw: `{{baseUrl}}${ep.path.replace(/:(\w+)/g, ':$1')}`,
      protocol: parsedProtocol,
      host: [parsedHost],
      port: parsedPort,
      path: pathSegments,
    };

    // Add query parameters
    const queryParams = ep.params.filter((p) => p.location === 'query');
    if (queryParams.length > 0) {
      url.query = queryParams.map((p) => ({
        key: p.name,
        value: this.sampleQueryValue(p.type),
        description: `${p.type ?? 'string'} parameter`,
      }));
    }

    // Add path variables
    const pathParams = ep.params.filter((p) => p.location === 'path');
    if (pathParams.length > 0) {
      url.variable = pathParams.map((p) => ({
        key: p.name,
        value: this.samplePathValue(p.type),
        description: `${p.type ?? 'string'} parameter`,
      }));
    }

    return url;
  }

  private buildHeaders(ep: Endpoint): Record<string, string>[] {
    const headers: Record<string, string>[] = [
      {
        key: 'Authorization',
        value: 'Bearer {{authToken}}',
        type: 'text',
      },
    ];

    if (this.hasBody(ep)) {
      headers.push({
        key: 'Content-Type',
        value: 'application/json',
        type: 'text',
      });
    }

    return headers;
  }

  private buildSampleBody(ep: Endpoint): Record<string, unknown> {
    if (!ep.body?.fields) return {};

    const body: Record<string, unknown> = {};
    for (const [name, type] of Object.entries(ep.body.fields)) {
      body[name] = this.sampleValue(type, name);
    }
    return body;
  }

  private sampleValue(type: string, name: string): unknown {
    switch (type) {
      case 'number':
      case 'float':
        return 1.0;
      case 'integer':
      case 'int':
        return 1;
      case 'boolean':
      case 'bool':
        return true;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return `test-${name}`;
    }
  }

  private sampleQueryValue(type?: string): string {
    switch (type) {
      case 'integer':
      case 'int':
      case 'number':
        return '1';
      case 'boolean':
      case 'bool':
        return 'true';
      default:
        return 'test';
    }
  }

  private samplePathValue(type?: string): string {
    switch (type) {
      case 'integer':
      case 'int':
      case 'number':
        return '1';
      default:
        return 'test-id';
    }
  }

  private hasBody(ep: Endpoint): boolean {
    return ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH';
  }

  private groupByPrefix(endpoints: Endpoint[]): Record<string, Endpoint[]> {
    const groups: Record<string, Endpoint[]> = {};
    for (const ep of endpoints) {
      const parts = ep.path.split('/').filter(Boolean);
      const prefix = parts.length > 0 ? `/${parts[0]}` : '/';
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(ep);
    }
    return groups;
  }
}
