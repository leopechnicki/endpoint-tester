<div align="center">

# endpoint-tester

**Auto-discover API endpoints in your source code and generate ready-to-run test suites.**

[![npm version](https://img.shields.io/npm/v/endpoint-tester.svg?style=flat-square&color=3b82f6)](https://www.npmjs.com/package/endpoint-tester)
[![npm downloads](https://img.shields.io/npm/dw/endpoint-tester.svg?style=flat-square&color=10b981)](https://www.npmjs.com/package/endpoint-tester)
[![license](https://img.shields.io/npm/l/endpoint-tester.svg?style=flat-square&color=6366f1)](https://github.com/leopechnicki/endpoint-tester/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/leopechnicki/endpoint-tester)
[![CI](https://img.shields.io/github/actions/workflow/status/leopechnicki/endpoint-tester/ci.yml?style=flat-square&label=CI)](https://github.com/leopechnicki/endpoint-tester/actions/workflows/ci.yml)

[npm](https://www.npmjs.com/package/endpoint-tester) · [GitHub](https://github.com/leopechnicki/endpoint-tester) · [Dev.to Article](https://dev.to/leo_pechnicki/endpoint-tester-auto-discover-api-endpoints-generate-tests-3d5j)

</div>

---

## Demo

<!-- Screenshot / GIF placeholder -->
<!-- To add a demo GIF: record your terminal running the Quick Demo below,
     upload to the repo (docs/demo.gif) and replace this comment with:
     ![endpoint-tester demo](docs/demo.gif) -->

> A GIF showing a full scan + generate cycle will appear here. In the meantime,
> see the [Quick Demo](#quick-demo) section below for the exact terminal output.

---

## The problem

Every API project needs endpoint tests. Writing them is tedious, repetitive, and error-prone: you copy-paste test files, update paths, remember which params go where, and hope you didn't miss a route. When the codebase changes, the tests fall behind.

## The solution

**endpoint-tester** scans your source code, discovers every API endpoint automatically, and generates test suites that are ready to run. Point it at your project, get a complete test file in seconds.

```
Source code in  -->  [endpoint-tester]  -->  Test suite out
  Express                                     Vitest / Jest
  Fastify                                     Pytest
  Koa
  NestJS
  FastAPI
  Flask
  Django
  Spring Boot
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Source Code                          │
│   src/routes/users.ts   src/routes/orders.ts   src/app.ts       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Framework Detection  │
                    │  (package.json / AST)  │
                    │  express, fastapi, ... │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Adapter / Parser    │
                    │  Reads route patterns  │
                    │  Extracts params/body  │
                    └───────────┬───────────┘
                                │
               ┌────────────────▼────────────────┐
               │         Endpoint Registry         │
               │  GET /users                       │
               │  POST /users          body: {...} │
               │  GET /users/:id       param: id   │
               │  PUT /users/:id       param: id   │
               │  DELETE /users/:id    param: id   │
               └────────────────┬────────────────┘
                                │
           ┌────────────────────▼──────────────────────┐
           │              Test Generator                 │
           │  - status code assertions (GET→200, POST→201) │
           │  - auth header tests (Bearer token)         │
           │  - error tests (missing body → 4xx)         │
           │  - boundary value tests (empty, negative ID) │
           └────────────────────┬──────────────────────┘
                                │
          ┌─────────────────────▼──────────────────────┐
          │               Output                        │
          │  tests/api.test.ts   openapi.yaml   stdout  │
          └────────────────────────────────────────────┘
```

## Quick Demo

A real Express.js app, from zero to a complete test suite in under 60 seconds.

**The app** (`src/app.ts`):

```typescript
import express from 'express'
import { Router } from 'express'

const app = express()
const router = Router()

router.get('/users', listUsers)
router.post('/users', createUser)
router.get('/users/:id', getUser)
router.put('/users/:id', updateUser)
router.delete('/users/:id', deleteUser)
router.get('/users/:id/orders', getUserOrders)

app.use('/api', router)
app.listen(3000)
```

**Step 1 — Install**

```bash
npm install -g endpoint-tester
# or use without installing:
npx endpoint-tester scan ./src
```

**Step 2 — Scan** (auto-detects Express)

```bash
$ endpoint-tester scan ./src

Auto-detected framework: express (high confidence)
Scanning ./src for express endpoints...
Found 6 endpoint(s):

  GET     /api/users
  POST    /api/users
  GET     /api/users/:id    [params: id]
  PUT     /api/users/:id    [params: id]
  DELETE  /api/users/:id    [params: id]
  GET     /api/users/:id/orders  [params: id]
```

**Step 3 — Generate tests**

```bash
$ endpoint-tester generate ./src --format vitest --output ./tests/api.test.ts

Generated 6 test cases → ./tests/api.test.ts
```

**The output** (`tests/api.test.ts`) — ready to run with `npx vitest`:

```typescript
import { describe, it, expect } from 'vitest'

const BASE_URL = 'http://localhost:3000'
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN ?? 'test-token'

describe('GET /api/users', () => {
  it('returns 200', async () => {
    const res = await fetch(`${BASE_URL}/api/users`)
    expect(res.status).toBe(200)
  })
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer invalid` },
    })
    expect(res.status).toBeOneOf([401, 403])
  })
})

describe('POST /api/users', () => {
  it('returns 201 with body', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(201)
  })
  it('returns 4xx with missing body', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, { method: 'POST' })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

describe('GET /api/users/:id', () => {
  it('returns 200 for valid id', async () => {
    const res = await fetch(`${BASE_URL}/api/users/1`)
    expect(res.status).toBe(200)
  })
  it('returns 404 for nonexistent id', async () => {
    const res = await fetch(`${BASE_URL}/api/users/999999`)
    expect(res.status).toBe(404)
  })
  it('returns 4xx for empty id', async () => {
    const res = await fetch(`${BASE_URL}/api/users/`)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ... DELETE, PUT, and nested routes follow the same pattern
```

**Step 4 — Run** (against your running server)

```bash
$ npx vitest run tests/api.test.ts

 PASS  tests/api.test.ts (1.2s)
   GET /api/users
     ✓ returns 200
     ✓ returns 401 without auth
   POST /api/users
     ✓ returns 201 with body
     ✓ returns 4xx with missing body
   GET /api/users/:id
     ✓ returns 200 for valid id
     ✓ returns 404 for nonexistent id
     ✓ returns 4xx for empty id
```

**Bonus — export OpenAPI spec**

```bash
$ endpoint-tester generate ./src --format openapi --output openapi.yaml

openapi: "3.1.0"
info:
  title: API
  version: "1.0.0"
paths:
  /api/users:
    get:
      summary: GET /api/users
      responses:
        "200": { description: OK }
  /api/users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      ...
```

Feed this to Swagger UI, Schemathesis, or `openapi-generator` — no manual annotations needed.

## Features

- **Auto-detection** -- Detects your framework automatically from package.json, requirements.txt, pom.xml, or source imports. No config needed.
- **13 framework adapters** -- Express.js, Fastify, Koa, NestJS, Hono, FastAPI, Flask, Django, Spring Boot, Gin, Echo, Chi, net/http. Extensible for any framework via the Adapter interface.
- **3 test formats** -- Vitest, Jest, Pytest. Generated tests include status code assertions, auth header tests, error response tests, and boundary value tests.
- **OpenAPI 3.1 output** -- Emit a spec straight from your source code (`--format openapi`, JSON or YAML). Feed it to Swagger UI, Schemathesis, Dredd, Apidog, or `openapi-generator` — no manual annotations, zero runtime dependencies.
- **Smart route parsing** -- Handles router prefixes, middleware chains, `app.route()` chaining, multi-line decorators, class-level annotations, Blueprints, and more.
- **Zero config** -- Works out of the box. One command, one output.

## Install

**Requirements:** Node.js >= 20

```bash
# Install globally (recommended)
npm install -g endpoint-tester

# Or use without installing (always pulls the latest version)
npx endpoint-tester scan ./src
```

Verify the installation:

```bash
endpoint-tester --version
# 0.3.0
```

## Quick start

Point endpoint-tester at your source directory — it auto-detects the framework.

```bash
# 1. Scan for endpoints (auto-detects framework from package.json / requirements.txt / pom.xml)
endpoint-tester scan ./src

# 2. Generate a test suite
endpoint-tester generate ./src --format vitest --output ./tests/api.test.ts

# 3. Run the generated tests (against your running server)
npx vitest run ./tests/api.test.ts
```

**Framework-specific examples:**

```bash
# Express.js — auto-detected from package.json
endpoint-tester scan ./src

# FastAPI — auto-detected from requirements.txt
endpoint-tester scan ./app

# Force a specific framework
endpoint-tester scan ./src --framework nestjs
endpoint-tester scan ./src --framework spring

# Generate a Pytest suite for FastAPI
endpoint-tester generate ./app --framework fastapi --format pytest --output ./tests/test_api.py

# Generate an OpenAPI 3.1 spec (no server required)
endpoint-tester generate ./src --format openapi --output openapi.yaml
```

**Working examples you can clone and run right now:**

```bash
# Express.js example
examples/express-sample/    # see examples/express-sample/README.md

# FastAPI example
examples/fastapi-sample/    # see examples/fastapi-sample/README.md

# Go examples (Gin, Echo, Chi, net/http)
examples/go-sample/         # see examples/go-sample/README.md
```

### Example output

Given an Express app:

```typescript
// src/routes/users.ts
router.get('/users', listUsers);
router.post('/users', createUser);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
```

Running `endpoint-tester scan ./src` outputs:

```
Auto-detected framework: express (high confidence)
Scanning ./src for express endpoints...
Found 5 endpoint(s):

  GET     /users
  POST    /users
  GET     /users/:id [params: id]
  PUT     /users/:id [params: id]
  DELETE  /users/:id [params: id]
```

Running `endpoint-tester generate ./src --format vitest` generates a complete test file with:

- Success tests with method-specific status codes (POST expects 201, DELETE expects 204, etc.)
- Auth header tests (Bearer token)
- Error response tests (missing body returns 4xx)
- Boundary value tests for path parameters (empty, negative, nonexistent)

## CLI reference

### scan / generate

| Option | Description | Default |
|---|---|---|
| `--framework` / `-f` | Framework adapter (express, fastapi, spring, django, flask, fastify, koa, nestjs, hono, gin, echo, chi, nethttp). Auto-detected if omitted. | auto-detect |
| `--output` / `-o` | Output path -- directory or file path | `./generated-tests` |
| `--format` | Output format (vitest, jest, pytest, go, openapi) | `vitest` |
| `--base-url` | Base URL for test requests | `http://localhost:3000` |
| `--watch` / `-w` | Watch for source file changes and re-scan/regenerate automatically | off |
| `--exclude` / `-e` | Glob patterns to exclude (repeatable) | none |
| `--verbose` / `-v` | Show source file and line number for each endpoint (scan only) | off |

### ci

Run in CI to guard against accidental endpoint deletion:

```bash
# First run saves a baseline (auto-created if missing)
endpoint-tester ci ./src

# Subsequent CI runs — exits 1 if fewer endpoints than baseline
endpoint-tester ci ./src

# After an intentional endpoint removal, refresh the baseline
endpoint-tester ci ./src --update-baseline

# Custom baseline file path (default: .endpoint-tester-baseline.json)
endpoint-tester ci ./src --baseline-file ci/baseline.json
```

Exit codes: `0` = pass (count same or higher), `1` = fail (count dropped below baseline).

### GitHub Action

Use the official GitHub Action to guard against endpoint regressions in CI:

```yaml
# .github/workflows/endpoint-check.yml
name: Endpoint Check
on: [push, pull_request]

jobs:
  check-endpoints:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: leopechnicki/endpoint-tester@main
        with:
          directory: './src'
          # framework: express    # optional -- auto-detected
```

The action will:
1. Install `endpoint-tester` globally
2. Run `endpoint-tester ci` against the specified directory
3. Fail the CI check if any endpoints were removed since the baseline
4. Auto-create the baseline on first run

**Inputs:**

| Input | Required | Default | Description |
|---|---|---|---|
| `directory` | yes | `./src` | Directory to scan |
| `framework` | no | auto-detect | Framework override |
| `baseline-file` | no | `.endpoint-tester-baseline.json` | Baseline file path |
| `update-baseline` | no | `false` | Set `true` to save new baseline |
| `generate-tests` | no | `false` | Also generate test files |
| `test-format` | no | `vitest` | Format for generated tests |
| `test-output` | no | `./generated-tests` | Output path for tests |
| `base-url` | no | `http://localhost:3000` | Base URL for tests |
| `node-version` | no | `20` | Node.js version |

**Outputs:** `endpoint-count` (number of endpoints found), `status` (`pass` or `fail`).

**Advanced: generate tests in CI**

```yaml
      - uses: leopechnicki/endpoint-tester@main
        with:
          directory: './src'
          generate-tests: 'true'
          test-format: 'vitest'
          test-output: './tests/generated'
```

## Config file

Instead of repeating CLI flags on every run, you can set defaults in a `.endpointtesterrc` (or `.endpointtesterrc.json`) file in the root of the project you are scanning:

```json
{
  "framework": "express",
  "outputDir": "./tests/generated",
  "testRunner": "vitest",
  "baseUrl": "http://localhost:3000",
  "exclude": ["legacy/**", "migrations/**"]
}
```

The loader searches for the config in this order (first hit wins):

1. The **scanned directory** (e.g. `endpoint-tester generate ./src` looks inside `./src`).
2. The **current working directory** — where you actually ran the command. This is the case most users hit: rc file at the project root, `endpoint-tester generate ./src`.
3. **Parent directories** of the scanned directory, walking up to the filesystem root (same pattern as ESLint/Prettier).

CLI flags always override config file values. Supported fields:

| Field | Type | Description |
|---|---|---|
| `framework` | string | Override auto-detection (`express`, `fastapi`, `nestjs`, etc.) |
| `outputDir` | string | Default output directory for generated tests |
| `testRunner` | string | Default format (`vitest`, `jest`, `pytest`, `go`, `openapi`) |
| `baseUrl` | string | Default base URL used in generated tests |
| `exclude` | string[] | Glob patterns to exclude from scanning |
| `include` | string[] | Additional glob patterns to include |

## Watch mode

Re-scan and regenerate every time a source file changes:

```bash
# Watch and rescan
endpoint-tester scan ./src --watch

# Watch and regenerate tests
endpoint-tester generate ./src --watch --output ./tests/api.test.ts
```

Watches `.ts`, `.js`, `.py`, `.go`, `.java`, `.kt`, `.rs` files. Changes are debounced (300 ms) to avoid spurious re-runs during saves. Press Ctrl+C to stop.

## Supported frameworks

| Framework | Patterns detected |
|---|---|
| **Express.js** | `app.get()`, `router.post()`, `app.route().get().post()`, route params, router prefixes via `app.use()` and `router.use()`, middleware chains |
| **Hono** | `app.get()`, `app.post()`, `app.route()` groups, `app.use()` mounts, `:param` path params, `c.req.query()` inference, body inference from `c.req.json()` |
| **Fastify** | `fastify.get()`, `fastify.route({ method, url, handler })`, shorthand method registrations |
| **Koa** | `@koa/router` with `router.get()` / `router.post()`, route params, `router.prefix()` |
| **NestJS** | `@Controller('prefix')` + method decorators (`@Get`, `@Post`, ...), `@Param`, `@Query`, `@Body` DTO inference |
| **FastAPI** | `@app.get()`, `@router.post()`, `APIRouter` prefixes, `{param}` parameters, multi-line decorators with kwargs |
| **Flask** | `@app.route()` with methods list, `@app.get()` shorthand, `Blueprint` url_prefix, typed parameters (`<int:id>`) |
| **Django** | `path()`, `re_path()`, typed parameters (`<int:pk>`), regex named groups |
| **Spring Boot** | `@GetMapping`, `@PostMapping`, `@RequestMapping` (both argument orderings), class-level `@RequestMapping` prefix, `@PathVariable`, multiline annotations, Kotlin `fun` syntax |
| **Gin** | `r.GET()`, `r.POST()`, `router.Group()` prefixes, route params (`:id`), `gin.Default()` and `gin.New()` |
| **Echo** | `e.GET()`, `e.POST()`, `e.Group()` prefixes, route params (`:id`), `echo.New()` |
| **Chi** | `r.Get()`, `r.Post()`, `r.Route()`, `r.Mount()` prefixes, route params (`{id}`) |
| **net/http** | `http.HandleFunc()`, `mux.HandleFunc()`, `http.Handle()`, route params (custom patterns) |

## Test formats

| | Vitest | Jest | Pytest |
|---|---|---|---|
| **Imports** | `import { describe, it, expect }` | Uses globals (no import) | `import requests` |
| **File** | `.ts` | `.ts` | `.py` |
| **Assertions** | `expect(response.status).toBe(201)` | Same | `assert response.status_code == 201` |

All formats generate:
- Method-specific status code assertions (GET -> 200, POST -> 201, DELETE -> 204)
- Auth header tests with Bearer token
- Error response tests for body-accepting endpoints
- Boundary value tests for path parameters

## Programmatic API

```typescript
import { Scanner, TestGenerator, getAdapter, detectFramework } from "endpoint-tester";

// Auto-detect the framework
const detected = await detectFramework("./src");
if (!detected) throw new Error("Could not detect framework");
const adapter = getAdapter(detected.framework);

// Scan for endpoints
const scanner = new Scanner(adapter);
const endpoints = await scanner.scan({ directory: "./src", framework: detected.framework });

// Generate tests
const generator = new TestGenerator();
const tests = generator.generate({
  endpoints,
  output: "./tests",
  format: "vitest",
  baseUrl: "http://localhost:3000",
});
```

## Custom adapters

Implement the `Adapter` interface to add support for any framework:

```typescript
import { Adapter, Endpoint, Framework, registerAdapter } from "endpoint-tester";

class HonoAdapter implements Adapter {
  framework = "hono" as Framework;
  fileExtensions = [".ts", ".js"];

  parse(source: string, filePath?: string): Endpoint[] {
    // Your parsing logic here
    return [];
  }
}

registerAdapter(new HonoAdapter());
```

## Comparison with alternatives

### vs. Schemathesis, Bruno, and Optic

The key distinction: most tools go **spec → tests**. endpoint-tester goes **source code → spec**.

| | endpoint-tester | Schemathesis | Bruno | Optic |
|---|---|---|---|---|
| **Starting point** | Source code | OpenAPI/GraphQL spec | Existing API collection | OpenAPI spec or traffic |
| **Spec required?** | No — generates it | Yes | Yes (or import) | Yes |
| **Test framework** | Vitest, Jest, Pytest, Go | pytest (property-based) | Bruno runner | Optic CI |
| **Approach** | Static analysis of routes | Fuzzing + property tests | Manual collection + run | Diff / contract testing |
| **Framework-aware** | 13 built-in adapters | Spec-agnostic | Spec-agnostic | Spec-agnostic |
| **Setup time** | Zero — point at source dir | Write/import spec first | Import or write collection | Import spec or capture traffic |
| **CI guard** | Built-in (`ci` command) | Via pytest integration | Bruno CLI | Optic CI action |
| **Watch mode** | Built-in (`--watch`) | No | No | No |
| **OpenAPI export** | Yes (3.1, JSON + YAML) | Consumes, not generates | Consumes | Generates from traffic |
| **Price** | Free / open-source | Free / open-source | Free / open-source | Free tier + paid |
| **Language** | TypeScript (Node.js) | Python | Any (CLI) | TypeScript |

**When to use each:**
- **endpoint-tester** — You have source code but no spec yet. Start here: get tests and a spec in one step.
- **Schemathesis** — You have a spec and want property-based fuzzing to find edge cases.
- **Bruno** — You prefer a Git-friendly Postman replacement for manual API exploration.
- **Optic** — You want to diff two spec versions or detect breaking changes in CI.

### vs. writing tests manually or Postman

| | endpoint-tester | Writing tests manually | Postman export |
|---|---|---|---|
| **Setup time** | 0 (auto-detects) | N/A | Import collection |
| **Keeps up with code** | Re-scan anytime | Manual updates | Re-export |
| **Boundary tests** | Automatic | Write each one | Manual |
| **Auth tests** | Automatic | Write each one | Configure per request |
| **Multi-framework** | 13 built-in | N/A | Framework-agnostic |
| **CI friendly** | CLI output | Already in repo | Needs Newman |

## Development

### Prerequisites

- Node.js >= 20
- npm

### Setup

```bash
git clone https://github.com/leopechnicki/endpoint-tester.git
cd endpoint-tester
npm install
```

### Commands

```bash
npm run build    # Compile TypeScript to dist/
npm test         # Run tests with vitest
npm run lint     # Lint with ESLint
npm run dev      # Watch mode (tsc --watch)
```

### Library usage (programmatic API)

Install as a dependency:

```bash
npm install endpoint-tester
```

Import types and classes:

```typescript
import {
  Scanner,
  TestGenerator,
  getAdapter,
  registerAdapter,
  detectFramework,
  Framework,
  type Adapter,
  type Endpoint,
  type EndpointParam,
  type EndpointBody,
  type HttpMethod,
  type ScanOptions,
  type GenerateOptions,
} from "endpoint-tester";
```

## Contributing

Contributions are welcome. Areas with the most impact:

- New framework adapters (Hono, Actix, Laravel, etc.)
- Smarter body inference from type annotations
- Watch mode for continuous test generation

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, ...). Releases are cut automatically by
[release-please](https://github.com/googleapis/release-please-action)
based on the commit history.

## License

MIT
