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
| `--output`      | Output directory for generated tests     | `./generated-tests`    |
| `--format`      | Test format (vitest, jest, pytest)        | `vitest`               |
| `--base-url`    | Base URL for test requests               | `http://localhost:3000`|

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
