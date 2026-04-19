<div align="center">

# endpoint-tester

**Auto-discover API endpoints in your source code and generate ready-to-run test suites.**

[![npm version](https://img.shields.io/npm/v/endpoint-tester.svg?style=flat-square&color=3b82f6)](https://www.npmjs.com/package/endpoint-tester)
[![npm downloads](https://img.shields.io/npm/dw/endpoint-tester.svg?style=flat-square&color=10b981)](https://www.npmjs.com/package/endpoint-tester)
[![license](https://img.shields.io/npm/l/endpoint-tester.svg?style=flat-square&color=6366f1)](https://github.com/leopechnicki/endpoint-tester/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/leopechnicki/endpoint-tester)
[![CI](https://img.shields.io/github/actions/workflow/status/leopechnicki/endpoint-tester/publish.yml?style=flat-square&label=CI)](https://github.com/leopechnicki/endpoint-tester/actions)

[npm](https://www.npmjs.com/package/endpoint-tester) · [GitHub](https://github.com/leopechnicki/endpoint-tester) · [Dev.to Article](https://dev.to/leo_pechnicki/endpoint-tester-auto-discover-api-endpoints-generate-tests-3d5j)

</div>

---

## The problem

Every API project needs endpoint tests. Writing them is tedious, repetitive, and error-prone: you copy-paste test files, update paths, remember which params go where, and hope you didn't miss a route. When the codebase changes, the tests fall behind.

## The solution

**endpoint-tester** scans your source code, discovers every API endpoint automatically, and generates test suites that are ready to run. Point it at your project, get a complete test file in seconds.

```
Source code in  -->  [endpoint-tester]  -->  Test suite out
  Express                                     Vitest / Jest
  FastAPI                                     Pytest
  Spring Boot
  Flask
  Django
```

## Features

- **Auto-detection** -- Detects your framework automatically from package.json, requirements.txt, pom.xml, or source imports. No config needed.
- **5 framework adapters** -- Express.js, FastAPI, Spring Boot, Flask, Django. Extensible for any framework via the Adapter interface.
- **3 test formats** -- Vitest, Jest, Pytest. Generated tests include status code assertions, auth header tests, error response tests, and boundary value tests.
- **Smart route parsing** -- Handles router prefixes, middleware chains, `app.route()` chaining, multi-line decorators, class-level annotations, Blueprints, and more.
- **Zero config** -- Works out of the box. One command, one output.

## Install

```bash
npm install -g endpoint-tester
```

Or use without installing:

```bash
npx endpoint-tester scan ./src
```

## Quick start

```bash
# Scan for endpoints (auto-detects framework)
endpoint-tester scan ./src

# Scan with explicit framework
endpoint-tester scan ./src --framework fastapi

# Generate test suite
endpoint-tester generate ./src --format vitest --output ./tests/api.test.ts

# Generate with custom base URL
endpoint-tester generate ./src --format jest --base-url http://localhost:8080
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

| Option | Description | Default |
|---|---|---|
| `--framework` / `-f` | Framework adapter (express, fastapi, spring, django, flask). Auto-detected if omitted. | auto-detect |
| `--output` / `-o` | Output path -- directory or file path | `./generated-tests` |
| `--format` | Test format (vitest, jest, pytest) | `vitest` |
| `--base-url` | Base URL for test requests | `http://localhost:3000` |

## Supported frameworks

| Framework | Patterns detected |
|---|---|
| **Express.js** | `app.get()`, `router.post()`, `app.route().get().post()`, route params, router prefixes via `app.use()` and `router.use()`, middleware chains |
| **FastAPI** | `@app.get()`, `@router.post()`, `APIRouter` prefixes, `{param}` parameters, multi-line decorators with kwargs |
| **Spring Boot** | `@GetMapping`, `@PostMapping`, `@RequestMapping` (both argument orderings), class-level `@RequestMapping` prefix, `@PathVariable`, multiline annotations, Kotlin `fun` syntax |
| **Flask** | `@app.route()` with methods list, `@app.get()` shorthand, `Blueprint` url_prefix, typed parameters (`<int:id>`) |
| **Django** | `path()`, `re_path()`, typed parameters (`<int:pk>`), regex named groups |

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

| | endpoint-tester | Writing tests manually | Postman export |
|---|---|---|---|
| **Setup time** | 0 (auto-detects) | N/A | Import collection |
| **Keeps up with code** | Re-scan anytime | Manual updates | Re-export |
| **Boundary tests** | Automatic | Write each one | Manual |
| **Auth tests** | Automatic | Write each one | Configure per request |
| **Multi-framework** | 5 built-in | N/A | Framework-agnostic |
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

- New framework adapters (Hono, Koa, NestJS, Gin, etc.)
- Smarter body inference from type annotations
- OpenAPI/Swagger output format
- Watch mode for continuous test generation

## License

MIT
