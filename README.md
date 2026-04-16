# endpoint-tester

Auto-discover API endpoints in your application and generate comprehensive test suites.

## Install

```bash
npm install -g endpoint-tester
```

## Usage

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

### Options

| Option          | Description                              | Default                |
| --------------- | ---------------------------------------- | ---------------------- |
| `--framework`   | Framework adapter (express, fastapi, spring) | `express`          |
| `-o, --output`  | Output path — directory or file path     | `./generated-tests`    |
| `--format`      | Test format (vitest, jest, pytest)        | `vitest`               |
| `--base-url`    | Base URL for test requests               | `http://localhost:3000`|

The `--output` flag accepts either a directory or a specific file path:

```bash
# Output to a directory (file named endpoints.test.ts automatically)
endpoint-tester generate ./src --output ./tests

# Output to a specific file
endpoint-tester generate ./src --output ./tests/api.test.ts
```

## Test formats: Jest vs Vitest

Both `jest` and `vitest` formats generate `.ts` test files. The key differences:

| Feature          | Vitest                                         | Jest                                      |
| ---------------- | ---------------------------------------------- | ----------------------------------------- |
| **Imports**      | Explicit `import { describe, it, expect }`     | Uses globals (no import statement)        |
| **File extension** | `.ts`                                        | `.ts`                                     |
| **Config needed** | `vitest.config.ts`                            | `jest.config.ts` with `ts-jest` or SWC    |
| **Assertions**   | Method-specific status codes (`toBe(201)`)     | Same                                      |

Both formats now generate **method-specific assertions** (POST expects 201, DELETE expects 204, etc.), **boundary value tests** for path parameters, **auth header tests**, and **error response tests** for endpoints that accept a body.

## Supported frameworks

- **Express.js** - Detects `app.get()`, `router.post()`, route params, nested routers
- **FastAPI** - Coming soon
- **Spring Boot** - Coming soon

## Programmatic API

```typescript
import { Scanner, TestGenerator, ExpressAdapter } from "endpoint-tester";

const scanner = new Scanner(new ExpressAdapter());
const endpoints = await scanner.scan({ directory: "./src", framework: "express" });

const generator = new TestGenerator();
const tests = generator.generate({ endpoints, output: "./tests", format: "vitest" });
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT
