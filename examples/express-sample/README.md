# Express Sample — endpoint-tester

A minimal Express.js REST API you can use to try `endpoint-tester` end-to-end.

## What's in this example

```
src/
  app.ts          Express app with 11 endpoints across /api/users and /api/products
tests/            (generated) Output directory for endpoint-tester
openapi.yaml      (generated) OpenAPI 3.1 spec
```

The app registers:

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /api/users | List users (query: page, limit) |
| POST | /api/users | Create user (body: name, email, role) |
| GET | /api/users/:id | Get user by id |
| PUT | /api/users/:id | Update user (body: name, email) |
| DELETE | /api/users/:id | Delete user |
| GET | /api/users/:id/orders | Get user orders |
| GET | /api/products | List products |
| POST | /api/products | Create product (body: name, price, category) |
| GET | /api/products/:id | Get product by id |
| PATCH | /api/products/:id | Patch product price (body: price) |
| DELETE | /api/products/:id | Delete product |

## Step 1 — Install dependencies (from repo root)

```bash
# Install endpoint-tester (from source)
cd ../../
npm install && npm run build
cd examples/express-sample
npm install
```

Or install the published package globally:

```bash
npm install -g endpoint-tester
```

## Step 2 — Scan for endpoints

```bash
npm run scan
# or directly:
npx endpoint-tester scan ./src --framework express
```

Expected output:

```
Auto-detected framework: express (high confidence)
Scanning ./src for express endpoints...
Found 12 endpoint(s):

  GET     /health
  GET     /api/users
  POST    /api/users
  GET     /api/users/:id         [params: id]
  PUT     /api/users/:id         [params: id]
  DELETE  /api/users/:id         [params: id]
  GET     /api/users/:id/orders  [params: id]
  GET     /api/products
  POST    /api/products
  GET     /api/products/:id      [params: id]
  PATCH   /api/products/:id      [params: id]
  DELETE  /api/products/:id      [params: id]
```

## Step 3 — Generate tests

```bash
npm run generate:vitest
# Creates: tests/api.test.ts
```

## Step 4 — Generate OpenAPI spec

```bash
npm run generate:openapi
# Creates: openapi.yaml
```

## Step 5 — Run tests (requires the server to be running)

In one terminal, start the server:

```bash
npm start
```

In another terminal, run the generated tests:

```bash
npm test
```

## Step 6 — CI guard (optional)

Commit a baseline and add to your CI pipeline:

```bash
npx endpoint-tester ci ./src
```

This exits with code 1 if any endpoint disappears compared to the saved baseline, preventing accidental regressions.
