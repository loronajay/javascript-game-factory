// The unlock presentation queue, kept pure so the toast's behaviour is
// testable without a document.
//
// Two jobs: order simultaneous unlocks into one-at-a-time presentation, and
// make sure a duplicate server response (a retried submission replays the
// same unlock list by design) does not show the same trophy twice. The
// dedupe key is `${gameSlug}:${id}`, so the same id in two games is two
// trophies.
function cleanText(value, max = 120) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function unlockKey(gameSlug, id) {
    return `${cleanText(gameSlug, 60)}:${cleanText(id, 80)}`;
}
export function createUnlockQueue() {
    const seen = new Set();
    const pending = [];
    return {
        enqueue(gameSlug, gameTitle, unlocked) {
            const list = Array.isArray(unlocked) ? unlocked : [];
            let added = 0;
            for (const raw of list) {
                const entry = raw && typeof raw === "object" ? raw : null;
                const id = cleanText(entry?.id, 80);
                if (!entry || !id)
                    continue;
                const key = unlockKey(gameSlug, id);
                if (seen.has(key))
                    continue;
                seen.add(key);
                pending.push({
                    key,
                    gameSlug: cleanText(gameSlug, 60),
                    gameTitle: cleanText(gameTitle, 80) || cleanText(gameSlug, 60),
                    id,
                    name: cleanText(entry.name, 80) || id,
                    description: cleanText(entry.description, 240),
                    secret: entry.secret === true,
                    points: Math.max(0, Math.floor(Number(entry.points) || 0)),
                });
                added += 1;
            }
            return added;
        },
        next() {
            return pending.shift() ?? null;
        },
        size() {
            return pending.length;
        },
        hasSeen(gameSlug, id) {
            return seen.has(unlockKey(gameSlug, id));
        },
    };
}
