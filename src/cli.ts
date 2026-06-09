#!/usr/bin/env node

import { Command } from "commander";
import { resolve, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync, watch as fsWatch, existsSync } from "node:fs";
import { Scanner } from "./scanner.js";
import { TestGenerator } from "./generator.js";
import { OpenApiGenerator } from "./openapi.js";
import { getAdapter } from "./adapters/index.js";
import { Framework, SUPPORTED_FORMATS, type SupportedFormat } from "./types.js";
import { detectFramework } from "./detect.js";
import { loadConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
) as { version: string };

program
  .name("endpoint-tester")
  .description("Auto-discover API endpoints and generate comprehensive test suites")
  .version(version);

const VALID_FRAMEWORKS = Object.values(Framework);

/**
 * Resolve the framework — use the explicit flag if provided, otherwise auto-detect.
 */
async function resolveFramework(directory: string, explicitFramework?: string): Promise<Framework> {
  if (explicitFramework) {
    if (!VALID_FRAMEWORKS.includes(explicitFramework as Framework)) {
      console.error(
        `Invalid --framework: "${explicitFramework}". Must be one of: ${VALID_FRAMEWORKS.join(", ")}.`,
      );
      process.exit(1);
    }
    return explicitFramework as Framework;
  }

  const detected = await detectFramework(directory);
  if (detected) {
    console.log(`Auto-detected framework: ${detected.framework} (${detected.confidence} confidence — ${detected.reason})`);
    return detected.framework;
  }

  // Check if this at least looks like a JS project — if so, fall back to express with a warning
  const pkgPath = resolve(directory, "package.json");
  if (existsSync(pkgPath)) {
    console.log("Warning: Could not detect a supported framework in package.json.");
    console.log("Defaulting to express. Use --framework to specify explicitly (express, fastapi, spring, django, flask, fastify, koa, nestjs, hono, gin, echo, chi, nethttp).");
    return Framework.Express;
  }

  // No framework detected, no JS project — fail with a clear message
  console.error("No framework detected. Use --framework to specify (express, fastapi, spring, django, flask, fastify, koa, nestjs, hono, gin, echo, chi, nethttp).");
  process.exit(1);
}

/** Extensions watched in --watch mode. */
const WATCH_EXTENSIONS = new Set([".ts", ".js", ".py", ".go", ".java", ".kt", ".rs"]);

/**
 * Start native fs.watch on a directory and call the callback on file changes,
 * debounced by the given delay (default 300 ms).
 * Returns a cleanup function that stops all watchers.
 */
function startWatcher(
  directory: string,
  debounceMs: number,
  onChange: (changedFile: string) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = fsWatch(directory, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // Only react to source-code file changes
    const ext = extname(filename.toString());
    if (!WATCH_EXTENSIONS.has(ext)) return;

    const displayPath = relative(directory, resolve(directory, filename.toString()));

    // Clear any pending debounce and restart
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChange(displayPath);
    }, debounceMs);
  });

  return () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    watcher.close();
  };
}

program
  .command("scan")
  .description("Scan a directory for API endpoints")
  .argument("<directory>", "Directory to scan")
  .option(
    "-f, --framework <framework>",
    "Framework to scan for (express, fastapi, spring, django, flask, fastify, koa, nestjs, hono, gin, echo, chi, nethttp)",
  )
  .option("-o, --output <file>", "Output file for results (JSON)")
  .option("-e, --exclude <patterns...>", "Glob patterns to exclude (repeatable, e.g. --exclude legacy/** test/**)")
  .option("-v, --verbose", "Show source file and line number for each endpoint")
  .option("-w, --watch", "Watch for file changes and re-scan automatically")
  .action(async (directory: string, options: { framework?: string; output?: string; exclude?: string[]; verbose?: boolean; watch?: boolean }) => {
    const dir = resolve(directory);

    // Load config file from the scanned directory; CLI flags take precedence
    const config = loadConfig(dir);
    const effectiveFramework = options.framework ?? config?.framework;
    const effectiveExclude = options.exclude ?? config?.exclude;

    const framework = await resolveFramework(dir, effectiveFramework);
    const adapter = getAdapter(framework);
    const scanner = new Scanner(adapter);

    const runScan = async (triggeredBy?: string) => {
      if (triggeredBy) {
        const ts = new Date().toLocaleTimeString();
        console.log(`\n[${ts}] Change detected in ${triggeredBy}, re-scanning...`);
      }

      console.log(`Scanning ${dir} for ${framework} endpoints...`);

      const endpoints = await scanner.scan({
        directory: dir,
        framework,
        exclude: effectiveExclude,
      });

      console.log(`Found ${endpoints.length} endpoint(s):\n`);

      for (const ep of endpoints) {
        const params = ep.params.length > 0 ? ` [params: ${ep.params.map((p) => p.name).join(", ")}]` : "";
        console.log(`  ${ep.method.padEnd(7)} ${ep.path}${params}`);
        if (options.verbose && ep.file) {
          const loc = ep.line !== undefined ? `${ep.file}:${ep.line}` : ep.file;
          console.log(`           ${loc}`);
        }
      }

      if (options.output) {
        const outPath = resolve(options.output);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, JSON.stringify(endpoints, null, 2));
        console.log(`\nResults written to ${outPath}`);
      }
    };

    await runScan();

    if (options.watch) {
      console.log("\nWatching for changes... (Ctrl+C to stop)");
      startWatcher(dir, 300, (changedFile) => {
        runScan(changedFile).catch((err: unknown) => {
          console.error("Scan error:", err);
        });
      });
      // Keep the process alive
      process.stdin.resume();
    }
  });

program
  .command("generate")
  .description("Generate test files from discovered endpoints")
  .argument("<directory>", "Directory to scan for endpoints")
  .option(
    "-f, --framework <framework>",
    "Framework to scan for (express, fastapi, spring, django, flask, fastify, koa, nestjs, hono, gin, echo, chi, nethttp)",
  )
  .option(
    "-o, --output <path>",
    "Output path — directory or file (e.g. ./tests or ./tests/api.test.ts)",
    "./generated-tests",
  )
  .option(
    "--format <format>",
    "Output format (vitest, jest, pytest, go, openapi). openapi emits an OpenAPI 3.1 spec; .yaml/.yml output writes YAML, otherwise JSON.",
    "vitest",
  )
  .option("--base-url <url>", "Base URL for tests", "http://localhost:3000")
  .option("-e, --exclude <patterns...>", "Glob patterns to exclude (repeatable, e.g. --exclude legacy/** test/**)")
  .option("-w, --watch", "Watch for file changes and regenerate tests automatically")
  .action(
    async (
      directory: string,
      options: {
        framework?: string;
        output: string;
        format: string;
        baseUrl: string;
        exclude?: string[];
        watch?: boolean;
      },
    ) => {
      const dir = resolve(directory);

      // Load config file from the scanned directory; CLI flags take precedence
      const config = loadConfig(dir);

      // Merge config defaults under CLI flags (CLI flags override config file)
      const effectiveFormat = (options.format !== "vitest" ? options.format : undefined) ?? config?.testRunner ?? options.format;
      const effectiveOutput = (options.output !== "./generated-tests" ? options.output : undefined) ?? config?.outputDir ?? options.output;
      const effectiveBaseUrl = (options.baseUrl !== "http://localhost:3000" ? options.baseUrl : undefined) ?? config?.baseUrl ?? options.baseUrl;
      const effectiveFramework = options.framework ?? config?.framework;
      const effectiveExclude = options.exclude ?? config?.exclude;

      try {
        new URL(effectiveBaseUrl);
      } catch {
        console.error(`Invalid --base-url: "${effectiveBaseUrl}" is not a valid URL.`);
        process.exit(1);
      }

      const validFormats: readonly string[] = SUPPORTED_FORMATS;
      if (!validFormats.includes(effectiveFormat)) {
        console.error(
          `Invalid --format: "${effectiveFormat}". Must be one of: ${validFormats.join(", ")}.`,
        );
        process.exit(1);
      }

      const framework = await resolveFramework(dir, effectiveFramework);
      const adapter = getAdapter(framework);
      const scanner = new Scanner(adapter);

      const runGenerate = async (triggeredBy?: string) => {
        if (triggeredBy) {
          const ts = new Date().toLocaleTimeString();
          console.log(`\n[${ts}] Change detected in ${triggeredBy}, regenerating...`);
        }

        console.log(`Scanning ${dir} for ${framework} endpoints...`);

        const endpoints = await scanner.scan({
          directory: dir,
          framework,
          exclude: effectiveExclude,
        });

        if (endpoints.length === 0) {
          console.log("No endpoints found.");
          return;
        }

        const outputPath = resolve(effectiveOutput);
        const outputExt = extname(outputPath).toLowerCase();

        if (effectiveFormat === "openapi") {
          console.log(`Found ${endpoints.length} endpoint(s). Generating OpenAPI spec...`);

          const isYaml = outputExt === ".yaml" || outputExt === ".yml";
          const specContent = new OpenApiGenerator().generate(endpoints, {
            baseUrl: effectiveBaseUrl,
            format: isYaml ? "yaml" : "json",
          });

          let specFile: string;
          if (outputExt) {
            mkdirSync(dirname(outputPath), { recursive: true });
            specFile = outputPath;
          } else {
            // Default output is the "./generated-tests" directory — write a spec file there.
            mkdirSync(outputPath, { recursive: true });
            specFile = resolve(outputPath, "openapi.json");
          }

          writeFileSync(specFile, specContent);
          console.log(`OpenAPI spec written to ${specFile}`);
          return;
        }

        console.log(`Found ${endpoints.length} endpoint(s). Generating tests...`);

        const generator = new TestGenerator();
        const testContent = generator.generate({
          endpoints,
          output: effectiveOutput,
          format: effectiveFormat as SupportedFormat,
          baseUrl: effectiveBaseUrl,
        });

        let outFile: string;

        if (outputExt) {
          // User provided a file path (e.g. ./tests/api.test.ts)
          mkdirSync(dirname(outputPath), { recursive: true });
          outFile = outputPath;
        } else {
          // User provided a directory path
          mkdirSync(outputPath, { recursive: true });
          const ext = effectiveFormat === "pytest" ? "py" : effectiveFormat === "go" ? "go" : "ts";
          const testFileSuffix = effectiveFormat === "go" ? "_test" : ".test";
          const testFileName = effectiveFormat === "go" ? `endpoints_test.${ext}` : `endpoints${testFileSuffix}.${ext}`;
          outFile = resolve(outputPath, testFileName);
        }

        writeFileSync(outFile, testContent);

        console.log(`Tests written to ${outFile}`);
      };

      await runGenerate();

      if (options.watch) {
        console.log("\nWatching for changes... (Ctrl+C to stop)");
        startWatcher(dir, 300, (changedFile) => {
          runGenerate(changedFile).catch((err: unknown) => {
            console.error("Generate error:", err);
          });
        });
        // Keep the process alive
        process.stdin.resume();
      }
    },
  );

program
  .command("ci")
  .description("CI integration mode — compare endpoint count against a saved baseline")
  .argument("<directory>", "Directory to scan for endpoints")
  .option(
    "-f, --framework <framework>",
    "Framework to scan for",
  )
  .option("--update-baseline", "Save current endpoint count as the new baseline")
  .option(
    "--baseline-file <file>",
    "Path to the baseline JSON file",
    ".endpoint-tester-baseline.json",
  )
  .action(
    async (
      directory: string,
      options: {
        framework?: string;
        updateBaseline?: boolean;
        baselineFile: string;
      },
    ) => {
      const dir = resolve(directory);

      // Load config file from the scanned directory; CLI flags take precedence
      const config = loadConfig(dir);
      const effectiveFramework = options.framework ?? config?.framework;

      const framework = await resolveFramework(dir, effectiveFramework);
      const adapter = getAdapter(framework);
      const scanner = new Scanner(adapter);

      console.log(`Scanning ${dir} for ${framework} endpoints...`);

      const endpoints = await scanner.scan({ directory: dir, framework, exclude: config?.exclude });
      const currentCount = endpoints.length;

      console.log(`Found ${currentCount} endpoint(s).`);

      const baselinePath = resolve(options.baselineFile);

      if (options.updateBaseline) {
        const baseline = { count: currentCount, framework, updatedAt: new Date().toISOString() };
        writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
        console.log(`Baseline updated: ${currentCount} endpoints saved to ${baselinePath}`);
        return;
      }

      if (!existsSync(baselinePath)) {
        // First run — save baseline automatically
        const baseline = { count: currentCount, framework, updatedAt: new Date().toISOString() };
        writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
        console.log(`No baseline found. Saved ${currentCount} endpoints as baseline to ${baselinePath}`);
        return;
      }

      // Compare against existing baseline
      const baselineData = JSON.parse(readFileSync(baselinePath, "utf-8")) as {
        count: number;
        framework?: string;
        updatedAt?: string;
      };
      const baselineCount = baselineData.count;

      if (currentCount < baselineCount) {
        const diff = baselineCount - currentCount;
        console.error(
          `CI FAIL: Endpoint count dropped from ${baselineCount} (baseline) to ${currentCount} (current). ` +
          `${diff} endpoint(s) removed. Run with --update-baseline to accept the new count.`,
        );
        process.exit(1);
      }

      console.log(`CI PASS: ${currentCount} endpoints (baseline: ${baselineCount})`);
    },
  );

program.parse();
