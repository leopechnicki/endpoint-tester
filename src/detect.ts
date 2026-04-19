import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import { Framework } from "./types.js";

interface DetectionResult {
  framework: Framework;
  confidence: "high" | "medium" | "low";
  reason: string;
}

/**
 * Auto-detect the API framework used in a project directory.
 *
 * Detection strategy:
 *   1. Check package.json dependencies (JS/TS projects)
 *   2. Check requirements.txt / pyproject.toml / setup.py (Python projects)
 *   3. Check pom.xml / build.gradle (Java/Kotlin projects)
 *   4. Fall back to file pattern scanning
 */
export async function detectFramework(directory: string): Promise<DetectionResult | null> {
  // Strategy 1: package.json (JS/TS)
  const pkgResult = detectFromPackageJson(directory);
  if (pkgResult) return pkgResult;

  // Strategy 2: Python dependency files
  const pyResult = detectFromPythonDeps(directory);
  if (pyResult) return pyResult;

  // Strategy 3: Java/Kotlin build files
  const javaResult = detectFromJavaBuild(directory);
  if (javaResult) return javaResult;

  // Strategy 4: File pattern scanning (fallback)
  const patternResult = await detectFromFilePatterns(directory);
  if (patternResult) return patternResult;

  return null;
}

function detectFromPackageJson(directory: string): DetectionResult | null {
  const pkgPath = join(directory, "package.json");
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    // NestJS check first (it uses Express/Fastify under the hood)
    if (allDeps["@nestjs/core"] || allDeps["@nestjs/common"]) {
      return { framework: Framework.NestJS, confidence: "high", reason: "@nestjs/core found in package.json dependencies" };
    }

    if (allDeps["fastify"]) {
      return { framework: Framework.Fastify, confidence: "high", reason: "fastify found in package.json dependencies" };
    }

    if (allDeps["koa"]) {
      return { framework: Framework.Koa, confidence: "high", reason: "koa found in package.json dependencies" };
    }

    if (allDeps["express"]) {
      return { framework: Framework.Express, confidence: "high", reason: "express found in package.json dependencies" };
    }

    // Check common Express-based frameworks that use Express routing
    if (allDeps["@types/express"]) {
      return { framework: Framework.Express, confidence: "high", reason: "@types/express found in package.json" };
    }

    if (allDeps["@types/koa"]) {
      return { framework: Framework.Koa, confidence: "high", reason: "@types/koa found in package.json" };
    }

    return null;
  } catch {
    return null;
  }
}

function detectFromPythonDeps(directory: string): DetectionResult | null {
  // Check requirements.txt
  const reqPath = join(directory, "requirements.txt");
  if (existsSync(reqPath)) {
    try {
      const content = readFileSync(reqPath, "utf-8").toLowerCase();
      if (content.includes("fastapi")) {
        return { framework: Framework.FastAPI, confidence: "high", reason: "fastapi found in requirements.txt" };
      }
      if (content.includes("flask")) {
        return { framework: Framework.Flask, confidence: "high", reason: "flask found in requirements.txt" };
      }
      if (content.includes("django")) {
        return { framework: Framework.Django, confidence: "high", reason: "django found in requirements.txt" };
      }
    } catch { /* ignore */ }
  }

  // Check pyproject.toml
  const pyprojectPath = join(directory, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8").toLowerCase();
      if (content.includes("fastapi")) {
        return { framework: Framework.FastAPI, confidence: "high", reason: "fastapi found in pyproject.toml" };
      }
      if (content.includes("flask")) {
        return { framework: Framework.Flask, confidence: "high", reason: "flask found in pyproject.toml" };
      }
      if (content.includes("django")) {
        return { framework: Framework.Django, confidence: "high", reason: "django found in pyproject.toml" };
      }
    } catch { /* ignore */ }
  }

  // Check setup.py
  const setupPath = join(directory, "setup.py");
  if (existsSync(setupPath)) {
    try {
      const content = readFileSync(setupPath, "utf-8").toLowerCase();
      if (content.includes("fastapi")) {
        return { framework: Framework.FastAPI, confidence: "high", reason: "fastapi found in setup.py" };
      }
      if (content.includes("flask")) {
        return { framework: Framework.Flask, confidence: "high", reason: "flask found in setup.py" };
      }
      if (content.includes("django")) {
        return { framework: Framework.Django, confidence: "high", reason: "django found in setup.py" };
      }
    } catch { /* ignore */ }
  }

  return null;
}

function detectFromJavaBuild(directory: string): DetectionResult | null {
  // Check pom.xml
  const pomPath = join(directory, "pom.xml");
  if (existsSync(pomPath)) {
    try {
      const content = readFileSync(pomPath, "utf-8");
      if (content.includes("spring-boot") || content.includes("spring-web")) {
        return { framework: Framework.Spring, confidence: "high", reason: "Spring Boot found in pom.xml" };
      }
    } catch { /* ignore */ }
  }

  // Check build.gradle or build.gradle.kts
  for (const gradleFile of ["build.gradle", "build.gradle.kts"]) {
    const gradlePath = join(directory, gradleFile);
    if (existsSync(gradlePath)) {
      try {
        const content = readFileSync(gradlePath, "utf-8");
        if (content.includes("spring-boot") || content.includes("org.springframework")) {
          return { framework: Framework.Spring, confidence: "high", reason: `Spring Boot found in ${gradleFile}` };
        }
      } catch { /* ignore */ }
    }
  }

  return null;
}

async function detectFromFilePatterns(directory: string): Promise<DetectionResult | null> {
  const defaultExclude = ["node_modules/**", "dist/**", "build/**", ".git/**", "venv/**", "__pycache__/**"];

  // Look for JS/TS framework patterns
  const tsFiles = await glob("**/*.{ts,js,mjs}", { cwd: directory, ignore: defaultExclude, absolute: true });
  for (const file of tsFiles.slice(0, 20)) {
    try {
      const content = readFileSync(file, "utf-8");

      // NestJS (check first — uses Express/Fastify internally)
      if (content.includes("from '@nestjs/common'") || content.includes("from \"@nestjs/common\"") ||
          content.includes("@Controller(") || content.includes("@Get(") || content.includes("@Post(")) {
        return { framework: Framework.NestJS, confidence: "medium", reason: `NestJS decorators found in ${file}` };
      }

      // Fastify
      if (content.includes("require('fastify')") || content.includes("require(\"fastify\")") ||
          content.includes("from 'fastify'") || content.includes("from \"fastify\"")) {
        return { framework: Framework.Fastify, confidence: "medium", reason: `Fastify import found in ${file}` };
      }

      // Koa
      if (content.includes("require('koa')") || content.includes("require(\"koa\")") ||
          content.includes("from 'koa'") || content.includes("from \"koa\"")) {
        return { framework: Framework.Koa, confidence: "medium", reason: `Koa import found in ${file}` };
      }

      // Express
      if (content.includes("require('express')") || content.includes("require(\"express\")") ||
          content.includes("from 'express'") || content.includes("from \"express\"")) {
        return { framework: Framework.Express, confidence: "medium", reason: `Express import found in ${file}` };
      }
    } catch { /* ignore */ }
  }

  // Look for Python framework patterns
  const pyFiles = await glob("**/*.py", { cwd: directory, ignore: defaultExclude, absolute: true });
  for (const file of pyFiles.slice(0, 20)) {
    try {
      const content = readFileSync(file, "utf-8");
      if (content.includes("from fastapi") || content.includes("import fastapi")) {
        return { framework: Framework.FastAPI, confidence: "medium", reason: `FastAPI import found in ${file}` };
      }
      if (content.includes("from flask") || content.includes("import flask")) {
        return { framework: Framework.Flask, confidence: "medium", reason: `Flask import found in ${file}` };
      }
      if (content.includes("from django") || content.includes("import django")) {
        return { framework: Framework.Django, confidence: "medium", reason: `Django import found in ${file}` };
      }
    } catch { /* ignore */ }
  }

  // Look for Spring patterns in Java/Kotlin files
  const javaFiles = await glob("**/*.{java,kt}", { cwd: directory, ignore: defaultExclude, absolute: true });
  for (const file of javaFiles.slice(0, 20)) {
    try {
      const content = readFileSync(file, "utf-8");
      if (content.includes("org.springframework")) {
        return { framework: Framework.Spring, confidence: "medium", reason: `Spring import found in ${file}` };
      }
    } catch { /* ignore */ }
  }

  return null;
}
