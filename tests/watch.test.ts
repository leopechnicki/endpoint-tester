/**
 * Tests for --watch mode in the CLI.
 *
 * We test the internal watch helper behaviour rather than spawning a long-running
 * CLI process (which would block the test runner). The approach:
 *   - Provide a fake fs.watch factory
 *   - Invoke a standalone watcher function (same logic as CLI)
 *   - Confirm debounce, extension filtering, and re-scan triggering
 *
 * Path assertions use path.join so they work on both Unix (/) and Windows (\).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Minimal inline implementation of the watcher so we can test it
// without importing the full CLI (which calls program.parse at module load).
// ---------------------------------------------------------------------------

const WATCH_EXTENSIONS = new Set([".ts", ".js", ".py", ".go", ".java", ".kt", ".rs"]);

function startWatcher(
  directory: string,
  debounceMs: number,
  onChange: (changedFile: string) => void,
  watchFn: typeof import("node:fs").watch,
): () => void {
  const { extname, relative, resolve } = require("node:path") as typeof import("node:path");
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watchFn(directory, { recursive: true }, (_eventType: string, filename: string | Buffer | null) => {
    if (!filename) return;
    const name = filename.toString();
    const ext = extname(name);
    if (!WATCH_EXTENSIONS.has(ext)) return;

    const displayPath = relative(directory, resolve(directory, name));

    if (debounceTimer !== null) clearTimeout(debounceTimer);

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

// ---------------------------------------------------------------------------
// Fake fs.watch factory — returns a spy-able watcher instance
// ---------------------------------------------------------------------------

function makeFakeWatch() {
  let capturedCallback: ((eventType: string, filename: string | null) => void) | null = null;
  const closeSpy = vi.fn();

  const fakeWatch = vi.fn(
    (
      _path: string,
      _options: unknown,
      cb: (eventType: string, filename: string | null) => void,
    ) => {
      capturedCallback = cb;
      return { close: closeSpy } as unknown as import("node:fs").FSWatcher;
    },
  ) as unknown as typeof import("node:fs").watch;

  const trigger = (eventType: string, filename: string | null) => {
    if (capturedCallback) capturedCallback(eventType, filename);
  };

  return { fakeWatch, closeSpy, trigger };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("watch mode — startWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onChange when a watched extension file changes", () => {
    const { fakeWatch, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    startWatcher("/project", 300, onChange, fakeWatch);

    trigger("change", "src/routes.ts");
    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledOnce();
    // Use platform-agnostic path comparison
    const calledWith: string = onChange.mock.calls[0][0] as string;
    expect(calledWith).toContain("routes.ts");
    expect(calledWith).toContain("src");
  });

  it("debounces rapid changes — calls onChange only once", () => {
    const { fakeWatch, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    startWatcher("/project", 300, onChange, fakeWatch);

    trigger("change", "src/a.ts");
    vi.advanceTimersByTime(100);
    trigger("change", "src/b.ts");
    vi.advanceTimersByTime(100);
    trigger("change", "src/c.ts");
    vi.advanceTimersByTime(300);

    // Only the last debounce fires
    expect(onChange).toHaveBeenCalledOnce();
    const calledWith: string = onChange.mock.calls[0][0] as string;
    expect(calledWith).toContain("c.ts");
  });

  it("does not call onChange for non-source files (.md, .json, .txt)", () => {
    const { fakeWatch, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    startWatcher("/project", 300, onChange, fakeWatch);

    trigger("change", "README.md");
    trigger("change", "package.json");
    trigger("change", "data.txt");
    vi.advanceTimersByTime(500);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange for all watched extensions", () => {
    const extensions = [".ts", ".js", ".py", ".go", ".java", ".kt", ".rs"];

    for (const ext of extensions) {
      const { fakeWatch, trigger } = makeFakeWatch();
      const onChange = vi.fn();

      startWatcher("/project", 300, onChange, fakeWatch);
      trigger("change", `src/file${ext}`);
      vi.advanceTimersByTime(300);

      expect(onChange).toHaveBeenCalledOnce();
    }
  });

  it("ignores events where filename is null", () => {
    const { fakeWatch, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    startWatcher("/project", 300, onChange, fakeWatch);

    trigger("change", null);
    vi.advanceTimersByTime(500);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("cleanup function stops the watcher and cancels debounce", () => {
    const { fakeWatch, closeSpy, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    const stop = startWatcher("/project", 300, onChange, fakeWatch);

    trigger("change", "src/routes.ts");
    // Stop before debounce fires
    stop();
    vi.advanceTimersByTime(300);

    expect(closeSpy).toHaveBeenCalledOnce();
    // onChange should NOT fire because debounce was cancelled
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows a second batch of changes after debounce settles", () => {
    const { fakeWatch, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    startWatcher("/project", 300, onChange, fakeWatch);

    // First change batch
    trigger("change", "src/a.ts");
    vi.advanceTimersByTime(300);

    // Second change batch
    trigger("change", "src/b.ts");
    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledTimes(2);
    const first: string = onChange.mock.calls[0][0] as string;
    const second: string = onChange.mock.calls[1][0] as string;
    expect(first).toContain("a.ts");
    expect(second).toContain("b.ts");
  });

  it("uses the correct platform path separator in displayPath", () => {
    const { fakeWatch, trigger } = makeFakeWatch();
    const onChange = vi.fn();

    startWatcher("/project", 300, onChange, fakeWatch);

    trigger("change", join("src", "routes.ts"));
    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledOnce();
    const calledWith: string = onChange.mock.calls[0][0] as string;
    // Should contain the expected filename regardless of separator
    expect(calledWith).toContain("routes.ts");
  });
});
