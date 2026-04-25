# Contributing to endpoint-tester

Contributions are welcome!

## Getting started

```bash
git clone https://github.com/leopechnicki/endpoint-tester.git
cd endpoint-tester
npm install
```

## Development workflow

```bash
npm run typecheck  # Type-check without emitting
npm run build      # Compile TypeScript
npm test           # Run tests (vitest)
npm run lint       # Lint with ESLint
npm run dev        # Watch mode
```

## Adding a framework adapter

1. Create `src/adapters/<framework>.ts` implementing the `Adapter` interface.
2. Register it in `src/adapters/index.ts`.
3. Add auto-detection logic in `src/detect.ts`.
4. Export from `src/index.ts`.
5. Add tests in `tests/adapters/<framework>.test.ts`.

## Pull requests

- One PR per feature or fix.
- Include tests for new adapters or behavior changes.
- Follow the existing code style (TypeScript strict mode, ESLint).

## Reporting issues

Open a GitHub issue at https://github.com/leopechnicki/endpoint-tester/issues
