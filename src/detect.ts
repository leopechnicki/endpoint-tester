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

  // Strategy 3b: Go module file
  const goResult = detectFromGoMod(directory);
  if (goResult) return goResult;

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

    if (allDeps["express"]) {
      return { framework: Framework.Express, confidence: "high", reason: "express found in package.json dependencies" };
    }

    // Check common Express-based frameworks that use Express routing
    if (allDeps["@types/express"]) {
      return { framework: Framework.Express, confidence: "high", reason: "@types/express found in package.json" };
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

function detectFromGoMod(directory: string): DetectionResult | null {
  const goModPath = join(directory, "go.mod");
  if (!existsSync(goModPath)) return null;

  try {
    const content = readFileSync(goModPath, "utf-8");

    if (content.includes("github.com/gin-gonic/gin")) {
      return { framework: Framework.Gin, confidence: "high", reason: "gin found in go.mod" };
    }
    if (content.includes("github.com/labstack/echo")) {
      return { framework: Framework.Echo, confidence: "high", reason: "echo found in go.mod" };
    }
    if (content.includes("github.com/go-chi/chi")) {
      return { framework: Framework.Chi, confidence: "high", reason: "chi found in go.mod" };
    }

    // go.mod exists but no known framework — assume net/http
    return { framework: Framework.NetHttp, confidence: "medium", reason: "go.mod present, no known router dependency" };
  } catch {
    return null;
  }
}

async function detectFromFilePatterns(directory: string): Promise<DetectionResult | null> {
  const defaultExclude = ["node_modules/**", "dist/**", "build/**", ".git/**", "venv/**", "__pycache__/**"];

  // Look for Express patterns in JS/TS files
  const tsFiles = await glob("**/*.{ts,js,mjs}", { cwd: directory, ignore: defaultExclude, absolute: true });
  for (const file of tsFiles.slice(0, 20)) {
    try {
      const content = readFileSync(file, "utf-8");
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

  // Look for Go framework patterns in .go files
  const goFiles = await glob("**/*.go", { cwd: directory, ignore: defaultExclude, absolute: true });
  for (const file of goFiles.slice(0, 20)) {
    try {
      const content = readFileSync(file, "utf-8");
      if (content.includes("gin.Default()") || content.includes("gin.New()")) {
        return { framework: Framework.Gin, confidence: "medium", reason: `Gin usage found in ${file}` };
      }
      if (content.includes("echo.New()")) {
        return { framework: Framework.Echo, confidence: "medium", reason: `Echo usage found in ${file}` };
      }
      if (content.includes("chi.NewRouter()")) {
        return { framework: Framework.Chi, confidence: "medium", reason: `Chi usage found in ${file}` };
      }
      if (content.includes("http.HandleFunc") || content.includes("mux.HandleFunc")) {
        return { framework: Framework.NetHttp, confidence: "medium", reason: `net/http usage found in ${file}` };
      }
    } catch { /* ignore */ }
  }

  return null;
}
