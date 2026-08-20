const ADAPTER_METHODS = ["create", "input", "step", "result", "render"];

function assertAdapter(runtime, adapter) {
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter?.[method] !== "function") {
      throw new Error(`Runtime '${runtime}' has no ${method} adapter method`);
    }
  }
}

export function createRuntimeRegistry(adapters) {
  const entries = new Map(Object.entries(adapters ?? {}));
  for (const [runtime, adapter] of entries) assertAdapter(runtime, adapter);
  return Object.freeze({
    forRuntime(runtime) {
      return entries.get(runtime) ?? null;
    },
    forDefinition(definition) {
      const adapter = entries.get(definition?.runtime);
      if (!adapter) throw new Error(`No runtime adapter for '${definition?.runtime}'`);
      return adapter;
    },
  });
}
