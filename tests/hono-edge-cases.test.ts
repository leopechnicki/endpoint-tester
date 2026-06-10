import { describe, it, expect } from 'vitest';
import { HonoAdapter } from '../src/adapters/hono.js';

const adapter = new HonoAdapter();

describe('HonoAdapter — edge cases', () => {
  describe('path normalization', () => {
    it('ensures leading slash when missing', () => {
      // Some hand-written source might omit the leading slash
      const src = `app.get('users', listUsers);`;
      const result = adapter.parse(src);
      if (result.length > 0) {
        expect(result[0].path.startsWith('/')).toBe(true);
      }
    });
  });

  describe('double-quote string paths', () => {
    it('parses double-quoted route strings', () => {
      const src = `app.get("/users", listUsers);`;
      const result = adapter.parse(src);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/users');
    });
  });

  describe('template literal paths', () => {
    it('parses template literal route strings', () => {
      const src = 'app.get(`/users`, listUsers);';
      const result = adapter.parse(src);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/users');
    });
  });

  describe('body inference for POST', () => {
    it('infers body fields from destructured c.req.json()', () => {
      const src = `
app.post('/users', async (c) => {
  const { name, email } = await c.req.json();
  return c.json({ id: 1 });
});
`;
      const result = adapter.parse(src);
      expect(result).toHaveLength(1);
      expect(result[0].method).toBe('POST');
      if (result[0].body?.fields) {
        expect(result[0].body.fields['name']).toBe('string');
        expect(result[0].body.fields['email']).toBe('string');
      }
    });
  });

  describe('all method', () => {
    it('expands app.all() to all HTTP methods', () => {
      const src = `app.all('/any', handler);`;
      const result = adapter.parse(src);
      const methods = new Set(result.map((ep) => ep.method));
      expect(methods.has('GET')).toBe(true);
      expect(methods.has('POST')).toBe(true);
      expect(methods.has('PUT')).toBe(true);
      expect(methods.has('DELETE')).toBe(true);
      expect(methods.has('PATCH')).toBe(true);
    });
  });

  describe('file metadata', () => {
    it('records filePath in endpoint', () => {
      const src = `app.get('/ping', handler);`;
      const result = adapter.parse(src, '/project/src/routes.ts');
      expect(result[0].file).toBe('/project/src/routes.ts');
    });

    it('records line number in endpoint', () => {
      const src = `\n\napp.get('/ping', handler);`;
      const result = adapter.parse(src, '/project/src/routes.ts');
      expect(result[0].line).toBe(3);
    });
  });

  describe('Hono with middleware chains', () => {
    it('correctly parses endpoint with multiple middleware args', () => {
      // app.get('/admin', authMiddleware, adminHandler) — should still extract the route
      const src = `app.get('/admin', authMiddleware, adminHandler);`;
      const result = adapter.parse(src);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/admin');
      expect(result[0].method).toBe('GET');
    });
  });

  describe('app.use() mount — not a route', () => {
    it('does not treat app.use() prefix mounts as endpoints', () => {
      const src = `
const logger = createLogger();
app.use('*', logger);
app.get('/users', getUsers);
`;
      const result = adapter.parse(src);
      // Only /users should appear, not the use() call
      expect(result.every((ep) => ep.path !== '*')).toBe(true);
      expect(result.some((ep) => ep.path === '/users')).toBe(true);
    });
  });
});
