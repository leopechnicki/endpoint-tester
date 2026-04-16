<div align="center">

# endpoint-tester

**Auto-discover API endpoints and generate comprehensive test suites.**

[![npm version](https://img.shields.io/npm/v/endpoint-tester.svg?style=flat-square&color=3b82f6)](https://www.npmjs.com/package/endpoint-tester)
[![npm downloads](https://img.shields.io/npm/dw/endpoint-tester.svg?style=flat-square&color=10b981)](https://www.npmjs.com/package/endpoint-tester)
[![license](https://img.shields.io/npm/l/endpoint-tester.svg?style=flat-square&color=6366f1)](https://github.com/leopechnicki/endpoint-tester/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/leopechnicki/endpoint-tester)
[![CI](https://img.shields.io/github/actions/workflow/status/leopechnicki/endpoint-tester/publish.yml?style=flat-square&label=CI)](https://github.com/leopechnicki/endpoint-tester/actions)

[npm](https://www.npmjs.com/package/endpoint-tester) · [Dev.to Article](https://dev.to/leo_pechnicki/endpoint-tester-auto-discover-api-endpoints-generate-tests-3d5j) · [GitHub](https://github.com/leopechnicki/endpoint-tester)

</div>

---

## Why?

Every API project needs endpoint tests, and writing them manually is tedious, repetitive work. You copy-paste test files, update paths, remember which params go where, and hope you didn't miss a route.

**endpoint-tester** scans your source code, discovers all API endpoints automatically, and generates ready-to-run test suites. It supports 5 frameworks and 3 test formats out of the box, with an extensible adapter pattern for anything else.

## How it works

endpoint-tester parses your route definitions — decorators, router configs, annotations — and outputs structured endpoint metadata plus test files. Each generated test hits the route and asserts the server responds correctly, giving you a smoke test baseline in seconds instead of hours.

```
src/routes/users.ts
  1. Scan route definitions
  2. Extract endpoints (GET /users, POST /users/:id, ...)
  3. Generate test file with method-specific assertions
  4. Output ready-to-run test suite
```

## Install

```bash
npm install -g endpoint-tester
```

## Quick start

### Scan for endpoints

```bash
endpoint-tester scan ./src --framework express
endpoint-tester scan ./src --framework express --output endpoints.json
```

### Generate tests

```bash
endpoint-tester generate ./src --framework express --format vitest --output ./tests
endpoint-tester generate ./src --format jest --base-url http://localhost:8080
```

## CLI options

| Option          | Description                              | Default                |
| --------------- | ---------------------------------------- | ---------------------- |
| `--framework`   | Framework adapter (express, fastapi, spring, flask, django) | `express` |
| `-o, --output`  | Output path — directory or file path     | `./generated-tests`    |
| `--format`      | Test format (vitest, jest, pytest)        | `vitest`               |
| `--base-url`    | Base URL for test requests               | `http://localhost:3000` |

The `--output` flag accepts either a directory or a specific file path:

```bash
# Output to a directory (file named endpoints.test.ts automatically)
endpoint-tester generate ./src --output ./tests

# Output to a specific file
endpoint-tester generate ./src --output ./tests/api.test.ts
```

## Supported frameworks

- **Express.js** — Detects `app.get()`, `router.post()`, route params, nested routers
- **FastAPI** — Decorators, `APIRouter` prefixes, typed parameters
- **Spring Boot** — `@RequestMapping`, `@GetMapping`, `@PathVariable` annotations
- **Flask** — Blueprints, typed route parameters
- **Django** — `path()`, `re_path()`, URL patterns

## Test formats: Jest vs Vitest vs Pytest

| Feature          | Vitest                                         | Jest                                      | Pytest                |
| ---------------- | ---------------------------------------------- | ----------------------------------------- | --------------------- |
| **Imports**      | Explicit `import { describe, it, expect }`     | Uses globals (no import statement)        | `import requests`     |
| **File extension** | `.ts`                                        | `.ts`                                     | `.py`                 |
| **Assertions**   | Method-specific status codes (`toBe(201)`)     | Same                                      | `assert response.status_code` |

All formats generate **method-specific assertions** (POST expects 201, DELETE expects 204, etc.), **boundary value tests** for path parameters, **auth header tests**, and **error response tests** for endpoints that accept a body.

## Programmatic API

```typescript
import { Scanner, TestGenerator, ExpressAdapter } from "endpoint-tester";

const scanner = new Scanner(new ExpressAdapter());
const endpoints = await scanner.scan({ directory: "./src", framework: "express" });

const generator = new TestGenerator();
const tests = generator.generate({ endpoints, output: "./tests", format: "vitest" });
```

## Extending with custom adapters

endpoint-tester uses an extensible adapter pattern. To add support for a new framework, implement the `Adapter` interface:

```typescript
import { Adapter, Endpoint, Framework } from "endpoint-tester";

class MyFrameworkAdapter implements Adapter {
  framework = Framework.Express; // use the closest built-in, or extend the enum
  fileExtensions = [".ts", ".js"];

  parse(source: string, filePath?: string): Endpoint[] {
    // Parse your framework's route definitions
    // Return an array of Endpoint objects
    return [];
  }
}
```

## Contributing

Contributions are welcome! We're especially looking for help with:

- New framework adapters (Hono, Koa, NestJS, etc.)
- Additional test format outputs
- Better endpoint detection heuristics

```bash
git clone https://github.com/leopechnicki/endpoint-tester.git
cd endpoint-tester
npm install
npm test
```

## License

MIT
