import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CLI_PATH = resolve(__dirname, "../dist/cli.js");
const TEST_DIR = join(process.cwd(), ".test-cli-tmp");

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    // execFileSync returns stdout; we capture stderr separately so assertions
    // on console.error output (which goes to stderr) work correctly.
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      cwd: process.cwd(),
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execErr.stdout ?? "",
      stderr: execErr.stderr ?? "",
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

describe("CLI integration", () => {
  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("should show version with --version", () => {
    const { stdout, exitCode } = runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("should show help with --help", () => {
    const { stdout, exitCode } = runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("endpoint-tester");
    expect(stdout).toContain("scan");
    expect(stdout).toContain("generate");
  });

  it("should show scan help with scan --help", () => {
    const { stdout, exitCode } = runCli(["scan", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("directory");
    expect(stdout).toContain("--framework");
  });

  it("should show generate help with generate --help", () => {
    const { stdout, exitCode } = runCli(["generate", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--format");
    expect(stdout).toContain("--base-url");
  });

  describe("scan command", () => {
    it("should scan an Express project and find endpoints", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "src/app.ts": `
import express from "express";
const app = express();
app.get('/users', getUsers);
app.post('/users', createUser);
`,
      });

      const { stdout, exitCode } = runCli(["scan", TEST_DIR]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Auto-detected framework: express");
      expect(stdout).toContain("Found 2 endpoint(s)");
      expect(stdout).toContain("GET");
      expect(stdout).toContain("/users");
    });

    it("should scan with explicit --framework flag", () => {
      setupProject({
        "app.py": `
from flask import Flask
app = Flask(__name__)

@app.get('/health')
def health():
    return "ok"
`,
      });

      const { stdout, exitCode } = runCli(["scan", TEST_DIR, "--framework", "flask"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Found 1 endpoint(s)");
      expect(stdout).toContain("/health");
    });

    it("should write JSON output with --output", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "routes.ts": `app.get('/test', handler);`,
      });

      const outputFile = join(TEST_DIR, "output.json");
      const { exitCode } = runCli(["scan", TEST_DIR, "--output", outputFile]);
      expect(exitCode).toBe(0);

      const output = JSON.parse(readFileSync(outputFile, "utf-8"));
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBeGreaterThan(0);
      expect(output[0].path).toBe("/test");
    });

    it("should create parent directory for a nested --output path", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "routes.ts": `app.get('/test', handler);`,
      });

      const outputFile = join(TEST_DIR, "reports", "nested", "scan.json");
      const { exitCode } = runCli(["scan", TEST_DIR, "--output", outputFile]);
      expect(exitCode).toBe(0);

      const output = JSON.parse(readFileSync(outputFile, "utf-8"));
      expect(Array.isArray(output)).toBe(true);
    });

    it("should report 0 endpoints for empty project", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "src/empty.ts": "// no routes here\n",
      });

      const { stdout, exitCode } = runCli(["scan", TEST_DIR]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Found 0 endpoint(s)");
    });
  });

  describe("generate command", () => {
    it("should generate test files from endpoints", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "app.ts": `
app.get('/users', getUsers);
app.post('/users', createUser);
`,
      });

      const outputDir = join(TEST_DIR, "generated");
      const { stdout, exitCode } = runCli(["generate", TEST_DIR, "--output", outputDir]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Found 2 endpoint(s)");
      expect(stdout).toContain("Tests written to");
    });

    it("should report no endpoints and skip generation for empty project", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "empty.ts": "// nothing\n",
      });

      const { stdout, exitCode } = runCli(["generate", TEST_DIR]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No endpoints found");
    });

    it("should reject an unsupported --format value", () => {
      setupProject({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
        "app.ts": `app.get('/users', getUsers);`,
      });

      // console.error() writes to stderr — verify the helper captures it correctly
      const { stdout, stderr, exitCode } = runCli(["generate", TEST_DIR, "--format", "mocha"]);
      expect(exitCode).toBe(1);
      // The error message goes to stderr (console.error); verify it is captured there
      expect(stderr).toContain("Invalid --format");
      expect(stderr).toContain("mocha");
      // stdout should be empty (no successful output before the early exit)
      expect(stdout.trim()).toBe("");
    });

    it("should reject an invalid --framework value in generate", () => {
      setupProject({
        "app.ts": `app.get('/users', getUsers);`,
      });

      const { stderr, exitCode } = runCli(["generate", TEST_DIR, "--framework", "rails"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid --framework");
      expect(stderr).toContain("rails");
    });
  });

  describe("scan command framework validation", () => {
    it("should reject an invalid --framework value in scan", () => {
      setupProject({
        "app.ts": `app.get('/users', getUsers);`,
      });

      const { stderr, exitCode } = runCli(["scan", TEST_DIR, "--framework", "rails"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid --framework");
      expect(stderr).toContain("rails");
    });
  });
});
