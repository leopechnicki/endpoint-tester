import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CLI_PATH = resolve(__dirname, "../dist/cli.js");
const TEST_DIR = join(process.cwd(), ".test-ci-tmp");

function runCli(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      cwd: process.cwd(),
      timeout: 15000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (execErr.stdout ?? "") + (execErr.stderr ?? ""),
      exitCode: execErr.status ?? 1,
    };
  }
}

function setupProject(files: Record<string, string>) {
  mkdirSync(TEST_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(TEST_DIR, name);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
}

describe("CLI — ci command", () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("shows ci help with ci --help", () => {
    const { stdout, exitCode } = runCli(["ci", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("baseline");
    expect(stdout).toContain("update-baseline");
  });

  it("creates baseline file on first run", () => {
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "app.ts": `app.get('/users', getUsers);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");
    const { stdout, exitCode } = runCli([
      "ci", TEST_DIR,
      "--baseline-file", baselineFile,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("baseline");
    expect(existsSync(baselineFile)).toBe(true);

    const baseline = JSON.parse(readFileSync(baselineFile, "utf-8")) as { count: number };
    expect(typeof baseline.count).toBe("number");
    expect(baseline.count).toBeGreaterThan(0);
  });

  it("exits 0 when endpoint count matches baseline", () => {
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "app.ts": `app.get('/users', getUsers);\napp.post('/users', createUser);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");

    // First run — saves baseline
    const { exitCode: firstExit } = runCli(["ci", TEST_DIR, "--baseline-file", baselineFile]);
    expect(firstExit).toBe(0);

    // Second run — same endpoints, should pass
    const { stdout, exitCode } = runCli(["ci", TEST_DIR, "--baseline-file", baselineFile]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("CI PASS");
  });

  it("exits 0 when endpoint count is higher than baseline", () => {
    // Baseline was saved with 1 endpoint — now we have 2 → should still pass (count went up)
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "app.ts": `app.get('/users', getUsers);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");
    writeFileSync(baselineFile, JSON.stringify({ count: 1, framework: "express", updatedAt: new Date().toISOString() }));

    // Add a second endpoint
    writeFileSync(join(TEST_DIR, "app.ts"), `app.get('/users', getUsers);\napp.post('/users', createUser);`);

    const { stdout, exitCode } = runCli(["ci", TEST_DIR, "--baseline-file", baselineFile]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("CI PASS");
  });

  it("exits 1 when endpoint count drops below baseline", () => {
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "app.ts": `app.get('/users', getUsers);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");
    // Baseline claims 5 endpoints but project only has 1
    writeFileSync(baselineFile, JSON.stringify({ count: 5, framework: "express", updatedAt: new Date().toISOString() }));

    const { stdout, exitCode } = runCli(["ci", TEST_DIR, "--baseline-file", baselineFile]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("CI FAIL");
    expect(stdout).toContain("5");
    expect(stdout).toContain("1");
  });

  it("--update-baseline saves new count and exits 0", () => {
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      "app.ts": `app.get('/users', getUsers);\napp.post('/users', createUser);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");
    // Old baseline says 10 endpoints
    writeFileSync(baselineFile, JSON.stringify({ count: 10, framework: "express", updatedAt: new Date().toISOString() }));

    const { stdout, exitCode } = runCli([
      "ci", TEST_DIR,
      "--baseline-file", baselineFile,
      "--update-baseline",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Baseline updated");

    const newBaseline = JSON.parse(readFileSync(baselineFile, "utf-8")) as { count: number; endpoints: string[] };
    expect(newBaseline.count).toBe(2);
    expect(Array.isArray(newBaseline.endpoints)).toBe(true);
    expect(newBaseline.endpoints).toContain("GET:/users");
    expect(newBaseline.endpoints).toContain("POST:/users");
  });

  it("fails when same-count endpoints are replaced (identity bug regression)", () => {
    // The old count-only logic would PASS here because both baseline and current have 2 endpoints.
    // The new identity-based logic must FAIL because the route identities differ.
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      // Current: GET /items and POST /items (2 endpoints, different paths from baseline)
      "app.ts": `app.get('/items', listItems);\napp.post('/items', createItem);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");
    // Baseline: GET /users and POST /users (also 2 endpoints, but different identity)
    writeFileSync(
      baselineFile,
      JSON.stringify({
        endpoints: ["GET:/users", "POST:/users"],
        count: 2,
        framework: "express",
        updatedAt: new Date().toISOString(),
      }),
    );

    const { stdout, exitCode } = runCli(["ci", TEST_DIR, "--baseline-file", baselineFile]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("CI FAIL");
    expect(stdout).toContain("GET:/users");
    expect(stdout).toContain("POST:/users");
  });

  it("passes when new endpoints are added to baseline set", () => {
    setupProject({
      "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      // Current: 3 endpoints — baseline had 2, the originals are still present
      "app.ts": `app.get('/users', getUsers);\napp.post('/users', createUser);\napp.delete('/users/:id', deleteUser);`,
    });

    const baselineFile = join(TEST_DIR, ".endpoint-tester-baseline.json");
    writeFileSync(
      baselineFile,
      JSON.stringify({
        endpoints: ["GET:/users", "POST:/users"],
        count: 2,
        framework: "express",
        updatedAt: new Date().toISOString(),
      }),
    );

    const { stdout, exitCode } = runCli(["ci", TEST_DIR, "--baseline-file", baselineFile]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("CI PASS");
  });
});
