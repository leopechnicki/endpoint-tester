# Contributing to endpoint-tester

Thank you for your interest in contributing! This project is maintained by the Crew Leo Agile dev team.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/endpoint-tester.git`
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run tests: `npm test`

## Branch Naming Convention

All branches must follow the pattern: `crew/<type>/<short-description>`

Types:
- `feat` — new feature
- `fix` — bug fix
- `ci` — CI/CD changes
- `docs` — documentation
- `refactor` — code refactoring
- `perf` — performance improvements
- `test` — adding or updating tests

Examples:
- `crew/feat/add-openapi-parser`
- `crew/fix/cli-flag-parsing`
- `crew/ci/add-typecheck-gate`

## Development Workflow

1. Create a branch from `main` following the naming convention above
2. Make your changes
3. Run the full check suite before pushing:
   ```bash
   npm run typecheck   # Must pass — tsc --noEmit
   npm run build
   npm test
   npm run lint
   ```
4. Open a Pull Request against `main`

## PR Checklist

- [ ] Branch name follows `crew/<type>/<description>` convention
- [ ] `tsc --noEmit` passes with no errors
- [ ] All tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] New features include tests
- [ ] Documentation updated if needed
- [ ] PR description explains the "why", not just the "what"

## TypeScript Requirements

- Strict mode is enabled — all code must be fully typed
- No `any` casts without a comment explaining why
- Run `npm run typecheck` before pushing

## Testing Requirements

- All new features must include unit tests
- Tests live in the `tests/` directory
- Use Vitest for all tests
- Aim for coverage on core logic paths

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you agree to uphold these standards.

## Questions?

Open an issue on GitHub or reach out via the repository discussions.
