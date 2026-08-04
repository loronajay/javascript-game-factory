// Row-shaping helpers shared by the admin-authored content tables (bulletins,
// arcade_events, cabinet_overrides, site_settings). Pure functions only — no queries —
// so the persistence modules can be read without chasing conversion logic across files.
export function toIso(value) {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "string" && value.trim())
        return value;
    return "";
}
// Timestamps arrive from an admin form as either an ISO string or a datetime-local
// value. Anything unparseable becomes null rather than epoch-zero, so "no date set"
// stays distinguishable from "1970" on the calendar.
export function toTimestampOrNull(value) {
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw)
        return null;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
// Slugs are the public URL identity of a bulletin or event, so they are generated from
// the title rather than accepted raw: an operator typing a title with punctuation should
// not be able to produce a slug that breaks a link or collides with a route segment.
export function slugify(value, fallback = "") {
    const slug = String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return slug || fallback;
}
export function singleLine(value, maxLength) {
    if (typeof value !== "string")
        return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
export function textBlock(value, maxLength) {
    if (typeof value !== "string")
        return "";
    return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}
// jsonb columns come back already parsed by pg, but a hand-run SQL insert can leave a
// string behind. Tolerate both so one bad row cannot break a whole feed.
export function stringList(value, maxItems = 24, maxLength = 80) {
    let source = value;
    if (typeof source === "string") {
        try {
            source = JSON.parse(source);
        }
        catch {
            return [];
        }
    }
    if (!Array.isArray(source))
        return [];
    const seen = new Set();
    const items = [];
    for (const entry of source) {
        const item = singleLine(entry, maxLength);
        if (!item || seen.has(item))
            continue;
        seen.add(item);
        items.push(item);
        if (items.length >= maxItems)
            break;
    }
    return items;
}
export function enumValue(value, allowed, fallback) {
    const candidate = singleLine(value, 24).toLowerCase();
    return allowed.includes(candidate) ? candidate : fallback;
}
