export function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeTimestampField(value: unknown, maxLength = 40): string {
  if (value instanceof Date) return value.toISOString().slice(0, maxLength);
  return sanitizeSingleLine(value, maxLength);
}

export function sanitizeTextBlock(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function sanitizeCount(value: unknown): number {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

export function sanitizePlayerId(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeGameSlug(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return sanitizeSingleLine(value, 80);
}
