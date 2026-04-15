import type { Adapter } from "../types.js";
import { Framework } from "../types.js";
import { ExpressAdapter } from "./express.js";

const adapterRegistry = new Map<Framework, Adapter>();

export function registerAdapter(adapter: Adapter): void {
  adapterRegistry.set(adapter.framework, adapter);
}

export function getAdapter(framework: Framework): Adapter {
  const adapter = adapterRegistry.get(framework);
  if (!adapter) {
    throw new Error(
      `No adapter registered for framework: ${framework}. Available: ${[...adapterRegistry.keys()].join(", ")}`,
    );
  }
  return adapter;
}

export function getAvailableFrameworks(): Framework[] {
  return [...adapterRegistry.keys()];
}

// Register built-in adapters
registerAdapter(new ExpressAdapter());

export { ExpressAdapter };
