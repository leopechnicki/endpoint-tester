import { readFileSync } from "node:fs";
import { glob } from "glob";
import type { Adapter, Endpoint, ScanOptions } from "./types.js";
import { getAdapter } from "./adapters/index.js";

export class Scanner {
  private adapter: Adapter;

  constructor(adapter?: Adapter) {
    this.adapter = adapter ?? getAdapter(undefined as never);
  }

  /**
   * Scan a directory for API endpoints using the configured adapter.
   */
  async scan(options: ScanOptions): Promise<Endpoint[]> {
    const adapter = this.adapter ?? getAdapter(options.framework);
    const extensions = adapter.fileExtensions.map((ext) => ext.replace(/^\./, ""));
    const pattern = `**/*.{${extensions.join(",")}}`;

    const defaultExclude = ["node_modules/**", "dist/**", "build/**", ".git/**"];
    const exclude = [...defaultExclude, ...(options.exclude ?? [])];

    const files = await glob(pattern, {
      cwd: options.directory,
      ignore: exclude,
      absolute: true,
    });

    const endpoints: Endpoint[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      const found = adapter.parse(source, file);
      endpoints.push(...found);
    }

    return endpoints;
  }

  /**
   * Parse a source string directly (useful for testing).
   */
  parseSource(source: string, filePath?: string): Endpoint[] {
    return this.adapter.parse(source, filePath);
  }

  /**
   * Set the adapter to use for scanning.
   */
  setAdapter(adapter: Adapter): void {
    this.adapter = adapter;
  }
}
