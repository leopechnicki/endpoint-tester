import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectFramework } from "../src/detect.js";

const TEST_DIR = join(process.cwd(), ".test-detect-tmp");

function setupDir(files: Record<string, string>) {
  mkdirSync(TEST_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(TEST_DIR, name);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
}

describe("detectFramework", () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe("package.json detection", () => {
    it("should detect Express from package.json dependencies", async () => {
      setupDir({
        "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" } }),
      });
      const result = await detectFramework(TEST_DIR);
      expect(result).not.toBeNull();
      expect(result!.framework).toBe("express");
      expect(result!.confidence).toBe("high");
    });

    it("should detect Express from @types/express in devDependencies", async () => {
      setupDir({
        "package.json": JSON.stringify({ devDependencies: { "@types/express": "^4.0.0" } }),
      });
      const result = await detectFramework(TEST_DIR);
      expect(result).not.toBeNull();
      expect(result!.framework).toBe("express");
    });
  });

  describe("Python dependency detection", () => {
    it("should detect FastAPI from requirements.txt", async () => {
      setupDir({
        "requirements.txt": "fastapi==0.100.0\nuvicorn\n",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result).not.toBeNull();
      expect(result!.framework).toBe("fastapi");
      expect(result!.confidence).toBe("high");
    });

    it("should detect Flask from requirements.txt", async () => {
      setupDir({
        "requirements.txt": "flask>=2.0\ngunicorn\n",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("flask");
    });

    it("should detect Django from requirements.txt", async () => {
      setupDir({
        "requirements.txt": "django>=4.0\ncelery\n",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("django");
    });

    it("should detect FastAPI from pyproject.toml", async () => {
      setupDir({
        "pyproject.toml": '[project]\ndependencies = ["fastapi>=0.100"]\n',
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("fastapi");
    });
  });

  describe("Java/Kotlin build file detection", () => {
    it("should detect Spring from pom.xml", async () => {
      setupDir({
        "pom.xml": "<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("spring");
      expect(result!.confidence).toBe("high");
    });

    it("should detect Spring from build.gradle", async () => {
      setupDir({
        "build.gradle": "implementation 'org.springframework.boot:spring-boot-starter-web'\n",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("spring");
    });

    it("should detect Spring from build.gradle.kts", async () => {
      setupDir({
        "build.gradle.kts": 'implementation("org.springframework.boot:spring-boot-starter-web")\n',
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("spring");
    });
  });

  describe("file pattern detection (fallback)", () => {
    it("should detect Express from import statements", async () => {
      setupDir({
        "src/app.ts": 'import express from "express";\nconst app = express();\n',
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("express");
      expect(result!.confidence).toBe("medium");
    });

    it("should detect FastAPI from Python imports", async () => {
      setupDir({
        "app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("fastapi");
      expect(result!.confidence).toBe("medium");
    });

    it("should detect Spring from Java imports", async () => {
      setupDir({
        "src/Controller.java": "import org.springframework.web.bind.annotation.GetMapping;\n",
      });
      const result = await detectFramework(TEST_DIR);
      expect(result!.framework).toBe("spring");
    });
  });

  it("should return null for empty directory", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const result = await detectFramework(TEST_DIR);
    expect(result).toBeNull();
  });
});
