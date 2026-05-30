function getAppRootUrl(moduleUrl: string = import.meta.url): URL {
  try {
    return new URL("../", moduleUrl);
  } catch {
    return new URL("http://localhost/");
  }
}

export function buildAppUrl(path: unknown, options: { moduleUrl?: string } = {}): string {
  const appRootUrl = getAppRootUrl(options?.moduleUrl || import.meta.url);
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return new URL(normalizedPath, appRootUrl).toString();
}

export function resolveAppRedirectTarget(next: unknown, options: { moduleUrl?: string; currentHref?: string } = {}): string {
  const moduleUrl = options?.moduleUrl || import.meta.url;
  const currentHref = options?.currentHref || globalThis.location?.href || buildAppUrl("index.html", { moduleUrl });
  const appRootUrl = getAppRootUrl(moduleUrl);
  const defaultTarget = buildAppUrl("me/index.html", { moduleUrl });
  const candidate = typeof next === "string" ? next.trim() : "";

  if (!candidate || candidate.startsWith("//")) {
    return defaultTarget;
  }

  try {
    const resolved = candidate.startsWith("/")
      ? new URL(candidate.replace(/^\/+/, ""), appRootUrl)
      : new URL(candidate, currentHref);
    const appRootPath = appRootUrl.pathname.endsWith("/") ? appRootUrl.pathname : `${appRootUrl.pathname}/`;
    if (resolved.origin !== appRootUrl.origin) return defaultTarget;
    if (!resolved.pathname.startsWith(appRootPath)) return defaultTarget;
    return resolved.toString();
  } catch {
    return defaultTarget;
  }
}
