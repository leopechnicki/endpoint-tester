import { readFileSync } from "node:fs";
import { glob } from "glob";
import type { Adapter, Endpoint, ScanOptions } from "./types.js";

export class Scanner {
  private adapter: Adapter;

  constructor(adapter: Adapter) {
    this.adapter = adapter;
  }

  /**
   * Scan a directory for API endpoints using the configured adapter.
   */
  async scan(options: ScanOptions): Promise<Endpoint[]> {
    const adapter = this.adapter;
    const extensions = adapter.fileExtensions.map((ext) => ext.replace(/^\./, ""));
    const pattern = extensions.length === 1
      ? `**/*.${extensions[0]}`
      : `**/*.{${extensions.join(",")}}`;

    const defaultExclude = ["node_modules/**", "dist/**", "build/**", ".git/**"];
    const exclude = [...defaultExclude, ...(options.exclude ?? [])];

    const files = await glob(pattern, {
      cwd: options.directory,
      ignore: exclude,
      absolute: true,
    });

    const endpoints: Endpoint[] = [];

    for (const file of files) {
      let source: string;
      try {
        source = readFileSync(file, "utf-8");
      } catch (err) {
        console.warn(`Warning: could not read file ${file}: ${(err as Error).message}`);
        continue;
      }
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
