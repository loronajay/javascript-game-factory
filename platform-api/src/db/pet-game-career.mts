// A player's Pet Games career: their online (PvP) record, their CPU wins and
// their best finish in every Grand Prix cup at every class.
//
// DERIVED, not stored: every Pet Games result a player files is already a
// deduplicated row in `game_ticket_results` (db/game-results), so the career
// is a read over those rows and there is no second copy to drift. A result the
// time-budget fence refused is stored at zero but never counted here — a
// script posting fake wins earns neither tickets nor a record.

export const PET_GAME_CAREER_SLUGS = Object.freeze(["barnyard-dash", "pondside-push"]);
const RECENT_ONLINE = 10;

function place(row: any): number | null {
  const value = Number(row?.finalPlace);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Pure: fold a player's settled result rows (oldest or newest first) into a career. */
export function summarizePetGameCareer(gameSlug: string, rows: readonly { result: any; submitted_at?: unknown }[]) {
  const online = { matches: 0, wins: 0, podiums: 0, bestPlace: null as number | null };
  const cpu = { matches: 0, wins: 0, byLevel: {} as Record<string, { matches: number; wins: number }> };
  const cups: Record<string, Record<string, { runs: number; bestPlace: number }>> = {};
  const recent: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const result = row.result ?? {};
    const finish = place(result);
    if (!finish) continue;
    if (result.mode === "online") {
      online.matches += 1;
      if (finish === 1) online.wins += 1;
      if (finish <= 3) online.podiums += 1;
      online.bestPlace = online.bestPlace === null ? finish : Math.min(online.bestPlace, finish);
      if (recent.length < RECENT_ONLINE) {
        recent.push({
          place: finish,
          fieldSize: Number(result.fieldSize ?? result.races?.[0]?.fieldSize) || null,
          humans: Number(result.humans) || null,
          courseId: result.races?.[0]?.courseId ?? null,
          at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at ?? null,
        });
      }
    } else if (result.mode === "cpu") {
      cpu.matches += 1;
      if (finish === 1) cpu.wins += 1;
      const level = String(result.level ?? "pro");
      cpu.byLevel[level] ??= { matches: 0, wins: 0 };
      cpu.byLevel[level].matches += 1;
      if (finish === 1) cpu.byLevel[level].wins += 1;
    } else if (result.mode === "cup" && result.cupId && result.level) {
      cups[result.cupId] ??= {};
      const entry = cups[result.cupId][result.level] ??= { runs: 0, bestPlace: finish };
      entry.runs += 1;
      entry.bestPlace = Math.min(entry.bestPlace, finish);
    }
  }
  return { gameSlug, online: { ...online, recent }, cpu, cups };
}

/** GET /games/:slug/career/:playerId — newest first, fenced results left out. */
export async function getPetGameCareer(pool: any, { gameSlug, playerId }: { gameSlug: string; playerId: string }) {
  const result = await pool.query(
    `select result, submitted_at
       from game_ticket_results
      where player_id = $1 and game_slug = $2
        and coalesce(ticket_breakdown->>'fence', '') = ''
      order by submitted_at desc
      limit 2000`,
    [playerId, gameSlug],
  );
  return summarizePetGameCareer(gameSlug, result.rows ?? []);
}
