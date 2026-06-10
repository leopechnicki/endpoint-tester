import { describe, it, expect } from 'vitest';
import { HonoAdapter } from '../src/adapters/hono.js';

const adapter = new HonoAdapter();

describe('HonoAdapter', () => {
  describe('framework metadata', () => {
    it('has framework = hono', () => {
      expect(adapter.framework).toBe('hono');
    });

    it('supports ts, js, mjs, cjs extensions', () => {
      expect(adapter.fileExtensions).toContain('.ts');
      expect(adapter.fileExtensions).toContain('.js');
      expect(adapter.fileExtensions).toContain('.mjs');
      expect(adapter.fileExtensions).toContain('.cjs');
    });
  });

  describe('shorthand HTTP methods', () => {
    it('parses app.get()', () => {
      const src = `app.get('/users', getUsers);`;
      const result = adapter.parse(src);
      expect(result).toHaveLength(1);
      expect(result[0].method).toBe('GET');
      expect(result[0].path).toBe('/users');
    });

    it('parses app.post()', () => {
      const src = `app.post('/users', createUser);`;
      const result = adapter.parse(src);
      expect(result[0].method).toBe('POST');
    });

    it('parses app.put()', () => {
      const src = `app.put('/users/:id', updateUser);`;
      const result = adapter.parse(src);
      expect(result[0].method).toBe('PUT');
    });

    it('parses app.delete()', () => {
      const src = `app.delete('/users/:id', deleteUser);`;
      const result = adapter.parse(src);
      expect(result[0].method).toBe('DELETE');
    });

    it('parses app.patch()', () => {
      const src = `app.patch('/users/:id', patchUser);`;
      const result = adapter.parse(src);
      expect(result[0].method).toBe('PATCH');
    });

    it('parses app.head()', () => {
      const src = `app.head('/health', healthCheck);`;
      const result = adapter.parse(src);
      expect(result[0].method).toBe('HEAD');
    });
  });

  describe('path parameters', () => {
    it('extracts :id param', () => {
      const src = `app.get('/users/:id', getUser);`;
      const result = adapter.parse(src);
      expect(result[0].params).toHaveLength(1);
      expect(result[0].params[0].name).toBe('id');
      expect(result[0].params[0].location).toBe('path');
      expect(result[0].params[0].required).toBe(true);
    });

    it('extracts multiple params', () => {
      const src = `app.get('/orgs/:orgId/repos/:repoId', getRepo);`;
      const result = adapter.parse(src);
      expect(result[0].params).toHaveLength(2);
      expect(result[0].params[0].name).toBe('orgId');
      expect(result[0].params[1].name).toBe('repoId');
    });

    it('handles route with no params', () => {
      const src = `app.get('/health', healthCheck);`;
      const result = adapter.parse(src);
      expect(result[0].params).toHaveLength(0);
    });
  });

  describe('route groups via app.route()', () => {
    it('prepends prefix from app.route()', () => {
      const src = `
const api = new Hono();
api.get('/users', getUsers);
api.post('/users', createUser);
app.route('/api', api);
`;
      const result = adapter.parse(src);
      // Routes on the 'api' sub-app should have /api prefix
      const withPrefix = result.filter((ep) => ep.path.startsWith('/api/'));
      expect(withPrefix.length).toBeGreaterThan(0);
    });
  });

  describe('multiple routes', () => {
    it('parses multiple route definitions', () => {
      const src = `
app.get('/users', listUsers);
app.post('/users', createUser);
app.get('/users/:id', getUser);
app.delete('/users/:id', deleteUser);
`;
      const result = adapter.parse(src);
      expect(result).toHaveLength(4);
      const methods = result.map((ep) => ep.method);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('DELETE');
    });
  });

  describe('middleware routes (no path extraction)', () => {
    it('does not extract app.use() as a route', () => {
      const src = `app.use('/middleware', middlewareFn);`;
      const result = adapter.parse(src);
      // app.use is a mount, not a route — should not appear as endpoint
      expect(result.length).toBe(0);
    });
  });

  describe('inline arrow function handlers', () => {
    it('marks inline handlers as anonymous', () => {
      const src = `app.get('/health', (c) => c.json({ ok: true }));`;
      const result = adapter.parse(src);
      expect(result).toHaveLength(1);
      expect(result[0].handler).toBe('<anonymous>');
    });
  });

  describe('query parameter inference', () => {
    it('infers query param from c.req.query()', () => {
      const src = `
app.get('/search', (c) => {
  const q = c.req.query('q');
  return c.json({ results: [] });
});
`;
      const result = adapter.parse(src);
      const queryParams = result[0].params.filter(
        (p) => p.location === 'query'
      );
      expect(queryParams.some((p) => p.name === 'q')).toBe(true);
    });
  });

  describe('response field inference', () => {
    it('infers response fields from c.json()', () => {
      const src = `
app.get('/me', (c) => {
  return c.json({ id: 1, name: 'Leo' });
});
`;
      const result = adapter.parse(src);
      expect(result[0].response).toBeDefined();
      expect(result[0].response?.fields).toBeDefined();
      expect(result[0].response!.fields!['id']).toBe('string');
      expect(result[0].response!.fields!['name']).toBe('string');
    });
  });

  describe('empty source', () => {
    it('returns empty array for empty source', () => {
      expect(adapter.parse('')).toHaveLength(0);
    });

    it('returns empty array for comment-only source', () => {
      expect(adapter.parse('// no routes here\n')).toHaveLength(0);
    });
  });
});
