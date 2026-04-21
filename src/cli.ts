#!/usr/bin/env node

import { Command } from "commander";
import { resolve, dirname, extname } from "node:path";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { Scanner } from "./scanner.js";
import { TestGenerator, SUPPORTED_FORMATS } from "./generator.js";
import { getAdapter } from "./adapters/index.js";
import { Framework } from "./types.js";
import { detectFramework } from "./detect.js";

const program = new Command();

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
) as { version: string };

program
  .name("endpoint-tester")
  .description("Auto-discover API endpoints and generate comprehensive test suites")
  .version(version);

/**
 * Resolve the framework — use the explicit flag if provided, otherwise auto-detect.
 */
async function resolveFramework(directory: string, explicitFramework?: string): Promise<Framework> {
  if (explicitFramework) {
    return explicitFramework as Framework;
  }

  const detected = await detectFramework(directory);
  if (detected) {
    console.log(`Auto-detected framework: ${detected.framework} (${detected.confidence} confidence — ${detected.reason})`);
    return detected.framework;
  }

  console.log("Could not auto-detect framework. Defaulting to express.");
  console.log("Hint: use --framework to specify explicitly (express, fastapi, spring, django, flask, fastify, koa, nestjs)");
  return Framework.Express;
}

program
  .command("scan")
  .description("Scan a directory for API endpoints")
  .argument("<directory>", "Directory to scan")
  .option(
    "-f, --framework <framework>",
    "Framework to scan for (express, fastapi, spring, django, flask, fastify, koa, nestjs)",
  )
  .option("-o, --output <file>", "Output file for results (JSON)")
  .action(async (directory: string, options: { framework?: string; output?: string }) => {
    const dir = resolve(directory);
    const framework = await resolveFramework(dir, options.framework);
    const adapter = getAdapter(framework);
    const scanner = new Scanner(adapter);

    console.log(`Scanning ${dir} for ${framework} endpoints...`);

    const endpoints = await scanner.scan({
      directory: dir,
      framework,
    });

    console.log(`Found ${endpoints.length} endpoint(s):\n`);

    for (const ep of endpoints) {
      const params = ep.params.length > 0 ? ` [params: ${ep.params.map((p) => p.name).join(", ")}]` : "";
      console.log(`  ${ep.method.padEnd(7)} ${ep.path}${params}`);
    }

    if (options.output) {
      writeFileSync(options.output, JSON.stringify(endpoints, null, 2));
      console.log(`\nResults written to ${options.output}`);
    }
  });

program
  .command("generate")
  .description("Generate test files from discovered endpoints")
  .argument("<directory>", "Directory to scan for endpoints")
  .option(
    "-f, --framework <framework>",
    "Framework to scan for (express, fastapi, spring, django, flask, fastify, koa, nestjs)",
  )
  .option(
    "-o, --output <path>",
    "Output path — directory or file (e.g. ./tests or ./tests/api.test.ts)",
    "./generated-tests",
  )
  .option("--format <format>", "Test format (vitest, jest, pytest)", "vitest")
  .option("--base-url <url>", "Base URL for tests", "http://localhost:3000")
  .action(
    async (
      directory: string,
      options: {
        framework?: string;
        output: string;
        format: string;
        baseUrl: string;
      },
    ) => {
      try {
        new URL(options.baseUrl);
      } catch {
        console.error(`Invalid --base-url: "${options.baseUrl}" is not a valid URL.`);
        process.exit(1);
      }

      const validFormats: readonly string[] = SUPPORTED_FORMATS;
      if (!validFormats.includes(options.format)) {
        console.error(
          `Invalid --format: "${options.format}". Must be one of: ${validFormats.join(", ")}.`,
        );
        process.exit(1);
      }

      const dir = resolve(directory);
      const framework = await resolveFramework(dir, options.framework);
      const adapter = getAdapter(framework);
      const scanner = new Scanner(adapter);

      console.log(`Scanning ${dir} for ${framework} endpoints...`);

      const endpoints = await scanner.scan({
        directory: dir,
        framework,
      });

      if (endpoints.length === 0) {
        console.log("No endpoints found.");
        return;
      }

      console.log(`Found ${endpoints.length} endpoint(s). Generating tests...`);

      const generator = new TestGenerator();
      const testContent = generator.generate({
        endpoints,
        output: options.output,
        format: options.format as "vitest" | "jest" | "pytest",
        baseUrl: options.baseUrl,
      });

      const outputPath = resolve(options.output);
      const outputExt = extname(outputPath);
      let outFile: string;

      if (outputExt) {
        // User provided a file path (e.g. ./tests/api.test.ts)
        mkdirSync(dirname(outputPath), { recursive: true });
        outFile = outputPath;
      } else {
        // User provided a directory path
        mkdirSync(outputPath, { recursive: true });
        const ext = options.format === "pytest" ? "py" : "ts";
        outFile = resolve(outputPath, `endpoints.test.${ext}`);
      }

      writeFileSync(outFile, testContent);

      console.log(`Tests written to ${outFile}`);
    },
  );

program.parse();
