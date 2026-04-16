#!/usr/bin/env node

import { Command } from "commander";
import { resolve, dirname, extname, basename } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { Scanner } from "./scanner.js";
import { TestGenerator } from "./generator.js";
import { getAdapter } from "./adapters/index.js";
import { Framework } from "./types.js";

const program = new Command();

program
  .name("endpoint-tester")
  .description("Auto-discover API endpoints and generate comprehensive test suites")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan a directory for API endpoints")
  .argument("<directory>", "Directory to scan")
  .option(
    "-f, --framework <framework>",
    "Framework to scan for (express, fastapi, spring)",
    "express",
  )
  .option("-o, --output <file>", "Output file for results (JSON)")
  .action(async (directory: string, options: { framework: string; output?: string }) => {
    const framework = options.framework as Framework;
    const adapter = getAdapter(framework);
    const scanner = new Scanner(adapter);

    const dir = resolve(directory);
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
    "Framework to scan for (express, fastapi, spring)",
    "express",
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
        framework: string;
        output: string;
        format: string;
        baseUrl: string;
      },
    ) => {
      const framework = options.framework as Framework;
      const adapter = getAdapter(framework);
      const scanner = new Scanner(adapter);

      const dir = resolve(directory);
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
