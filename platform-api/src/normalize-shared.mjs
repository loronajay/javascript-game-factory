export function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeTimestampField(value, maxLength = 40) {
  if (value instanceof Date) return value.toISOString().slice(0, maxLength);
  return sanitizeSingleLine(value, maxLength);
}

export function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

export function sanitizePlayerId(value) {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeGameSlug(value) {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return sanitizeSingleLine(value, 80);
}
