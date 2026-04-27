import type { Adapter } from "../types.js";
import { Framework } from "../types.js";
import { ExpressAdapter } from "./express.js";
import { FastAPIAdapter } from "./fastapi.js";
import { SpringAdapter } from "./spring.js";
import { DjangoAdapter } from "./django.js";
import { FlaskAdapter } from "./flask.js";
import { GinAdapter } from "./gin.js";
import { EchoAdapter } from "./echo.js";
import { ChiAdapter } from "./chi.js";
import { NetHttpAdapter } from "./nethttp.js";

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
registerAdapter(new FastAPIAdapter());
registerAdapter(new SpringAdapter());
registerAdapter(new DjangoAdapter());
registerAdapter(new FlaskAdapter());
registerAdapter(new GinAdapter());
registerAdapter(new EchoAdapter());
registerAdapter(new ChiAdapter());
registerAdapter(new NetHttpAdapter());

export { ExpressAdapter, FastAPIAdapter, SpringAdapter, DjangoAdapter, FlaskAdapter, GinAdapter, EchoAdapter, ChiAdapter, NetHttpAdapter };
