// Minimum-supported-version policy for the PACKAGED apps (today only the Tactical Arena
// Android build; the registry is keyed by app id + platform so a second package plugs in
// without touching route code — the same shape as the other `*-catalog` services).
//
// The one rule that matters here: this service FAILS OPEN. A missing setting, an
// unparseable value, a cold database — every one of them resolves to "no minimum", which
// means the app plays normally. A version gate that errors closed would brick every
// installed copy of a paid product the moment a config row went missing, which is a far
// worse outcome than briefly failing to block an old build.
//
// Resolution order, first hit wins:
//   1. site_settings["app_release:<appId>:<platform>"]  — operator-set, no redeploy
//   2. process.env fallbacks                            — set on the host, survives an empty DB
//   3. nothing                                          — minimumVersionCode 0, never blocks

export const ANDROID_PLATFORM = "android";

// The only packaged app today. Kept here rather than in the route so adding a second
// package is a registry edit.
export const PACKAGED_APPS = Object.freeze({
  "com.jayarcade.tacticalarena": Object.freeze({
    platform: ANDROID_PLATFORM,
    storeUrl: "https://play.google.com/store/apps/details?id=com.jayarcade.tacticalarena",
    // Android resolves market:// to the Play app directly; the client falls back to storeUrl
    // when no handler exists (a device without Play, or the web build).
    updateUrl: "market://details?id=com.jayarcade.tacticalarena",
    env: Object.freeze({
      minimum: "TA_ANDROID_MIN_VERSION_CODE",
      latest: "TA_ANDROID_LATEST_VERSION_CODE",
    }),
  }),
});

export const DEFAULT_APP_ID = "com.jayarcade.tacticalarena";

function settingKey(appId: string, platform: string): string {
  return `app_release:${appId}:${platform}`;
}

// Version codes are Play's monotonic integers. Anything that is not a non-negative integer
// is treated as absent rather than coerced — a typo must not become a gate. Note this is
// deliberately STRICTER than Number.parseInt: "12.5" is rejected outright rather than
// truncated to 12, because a truncated typo is a silently wrong gate that locks out real
// installs. (The client parses its OWN build with parseInt on purpose — Play reports an
// integer there — but operator-entered config gets no such benefit of the doubt.)
function versionCode(value: unknown): number {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return 0;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function resolveAppReleasePolicy({
  appId = DEFAULT_APP_ID,
  platform = ANDROID_PLATFORM,
  settings = {},
  env = {},
}: {
  appId?: string;
  platform?: string;
  settings?: Record<string, unknown>;
  env?: Record<string, unknown>;
} = {}): {
  appId: string;
  platform: string;
  minimumVersionCode: number;
  latestVersionCode: number;
  storeUrl: string;
  updateUrl: string;
} | null {
  const registered = (PACKAGED_APPS as Record<string, any>)[appId];
  if (!registered || registered.platform !== platform) return null;

  const raw = settings?.[settingKey(appId, platform)];
  const setting = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const minimumVersionCode = versionCode(setting.minimumVersionCode)
    || versionCode(env[registered.env.minimum]);
  const latestVersionCode = versionCode(setting.latestVersionCode)
    || versionCode(env[registered.env.latest])
    // A latest that is not configured is at least the minimum — never report a "latest"
    // lower than the version we are about to demand.
    || minimumVersionCode;

  return {
    appId,
    platform,
    minimumVersionCode,
    latestVersionCode: Math.max(latestVersionCode, minimumVersionCode),
    storeUrl: nonEmptyString(setting.storeUrl) || registered.storeUrl,
    updateUrl: nonEmptyString(setting.updateUrl) || registered.updateUrl,
  };
}
