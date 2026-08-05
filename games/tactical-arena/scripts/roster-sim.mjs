// Roster simulator — measures every draftable unit through the REAL engine.
//
// It replaces the old scripts/comp-sim.mjs, which played 13 hand-picked comps against each
// other and so could only ever measure the units its author already thought were good. This
// script samples random legal squads across the WHOLE roster, so each unit is measured
// beside and against every other unit rather than inside one person's shortlist. That is
// what makes a tier list defensible rather than a vibe.
//
// Pass --comps to play a named shortlist head-to-head instead, which is how a squad the
// model proposes gets verified.
//
// Every match runs through createMatchState -> chooseActivation (real CPU) -> applyCommand
// (the one true reducer). Nothing is approximated.
//
// Usage:
//   node scripts/roster-sim.mjs --games 24000 --difficulty hard --workers 10
//   node scripts/roster-sim.mjs --games 500            # quick smoke run
//   node scripts/roster-sim.mjs --out balance-data/sim-hard.json
//
// Telemetry design: per-unit contribution is derived by DIFFING HP across every applied
// command and attributing the delta to the acting unit. That is mechanism-agnostic — it
// catches resolver-coded true damage, fire ticks, thorns, auras, and summon damage alike,
// none of which a static read of unit data would find. Turn-boundary damage (hazards,
// poison ticks) lands outside any activation and is bucketed separately rather than being
// misattributed to whoever moved last.

import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync, readFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Dynamic import() needs a file:// URL on Windows — a bare `C:\...` path is rejected
// by the ESM loader as an unsupported scheme.
const src = (relative) => pathToFileURL(resolve(ROOT, relative)).href;

// ---- shared config ---------------------------------------------------------
const SQUAD_SIZE = 4;
const ACTIVATION_CAP = 500; // hard stop so a stalemate can't hang a worker

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ---- deterministic squad sampling -----------------------------------------
// mulberry32: tiny, fast, and reproducible so a run can be replayed exactly from its
// seed. This RNG picks SQUADS only; everything inside a match uses the engine's own
// seeded rngState.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Distinct units per squad: team auras dedup by stackKey, so a duplicate contributes
// nothing to its own aura and would quietly bias the ratings downward for aura units.
function sampleSquad(rand, roster) {
  const pool = [...roster];
  const squad = [];
  for (let i = 0; i < SQUAD_SIZE; i += 1) {
    const idx = Math.floor(rand() * pool.length);
    squad.push(pool.splice(idx, 1)[0]);
  }
  return squad;
}

// ---- worker ----------------------------------------------------------------
if (!isMainThread) {
  const { jobs, difficulty, size } = workerData;

  const [
    { createMatchState, hpRemaining },
    { applyCommand },
    { chooseActivation, cpuRng },
    { getArt, isRaging },
    { findUnit }
  ] = await Promise.all([
    import(src("src/match/matchBuilder.js")),
    import(src("src/core/reducer.js")),
    import(src("src/ai/cpuController.js")),
    import(src("src/core/unitCatalog.js")),
    import(src("src/core/state.js"))
  ]);

  // A fresh telemetry bucket for one unit instance in one match.
  const newUnitStat = () => ({
    activations: 0,
    ragingActivations: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    healingReceived: 0,
    kills: 0,
    died: 0,
    mpSpent: 0,
    artUses: {},
    basicAttacks: 0,
    defends: 0,
    finalHpPct: 0
  });

  function snapshotHp(state) {
    const map = new Map();
    for (const unit of state.units) map.set(unit.id, unit.hp);
    return map;
  }

  function playMatch(squadA, squadB, seed, aSeat) {
    const bSeat = aSeat === 1 ? 2 : 1;
    const squads = { [aSeat]: squadA, [bSeat]: squadB };
    let state = createMatchState({ size, seed, squads });

    // unit id -> telemetry. Summons (Ghouls) get buckets too; their damage is credited
    // to the summon itself, and the summoner's rating still benefits via the win result.
    const stats = new Map();
    const typeById = new Map();
    const playerById = new Map();
    const startHp = new Map();
    for (const unit of state.units) {
      stats.set(unit.id, newUnitStat());
      typeById.set(unit.id, unit.type);
      playerById.set(unit.id, unit.player);
      startHp.set(unit.id, unit.hp);
    }

    // Damage that lands at a turn boundary (fire tiles, poison ticks, weather) rather
    // than inside somebody's activation. Kept separate so it never inflates a unit's
    // measured output.
    let hazardDamage = 0;

    // Summoned bodies (Necromancer Ghouls, Summoner ghosts) are created mid-match and so
    // have no bucket of their own. Their output belongs to whoever put them on the board —
    // for the Summoner especially, trading his activation for somebody else's turn IS his
    // entire kit, and crediting it to nobody made him look like he dealt no damage at all.
    // Walks the summon chain (a ghost could in principle summon), bounded against a cycle.
    const creditStatFor = (currentState, unit) => {
      let owner = unit;
      for (let hops = 0; owner && !stats.has(owner.id) && hops < 4; hops += 1) {
        if (!owner.summonerId) return null;
        owner = findUnit(currentState, owner.summonerId);
      }
      return owner ? stats.get(owner.id) ?? null : null;
    };
    let activeUnitId = null;
    let activations = 0;
    let drawReason = null;

    while (state.phase === "playing" && activations < ACTIVATION_CAP) {
      const player = state.currentPlayer;
      let commands;
      try {
        commands = chooseActivation(state, { difficulty, cpuPlayer: player, rng: cpuRng(state) });
      } catch (error) {
        return { error: `chooseActivation: ${error.message}`, squadA, squadB, seed, aSeat };
      }
      if (!commands || commands.length === 0) { drawReason = "no-move"; break; }

      const revisionBefore = state.revision;

      for (const command of commands) {
        // Track the acting unit from the command itself rather than from BEGIN_ACTIVATION
        // alone. An actsFirst commander (King, Mother Nature) issues a BARE USE_ART with
        // no BEGIN_ACTIVATION in front of it, so keying off BEGIN_ACTIVATION credited the
        // King's commands — and any damage they caused — to whichever unit happened to act
        // before him, while the King himself recorded zero activations.
        // ATTACK carries the actor as `actorId`; everything else uses `unitId`.
        const commandUnitId = command.unitId ?? command.actorId ?? null;
        const previousActiveId = activeUnitId;
        if (commandUnitId) activeUnitId = commandUnitId;

        const actor = activeUnitId ? findUnit(state, activeUnitId) : null;
        const before = snapshotHp(state);
        const mpBefore = actor ? (actor.mp ?? 0) : 0;

        // A unit "starts acting" on an explicit BEGIN_ACTIVATION, or — for a commander —
        // the moment the acting unit changes to it without one.
        const startedActing = command.type === "BEGIN_ACTIVATION"
          || (commandUnitId !== null && commandUnitId !== previousActiveId);
        if (startedActing && actor) {
          const s = stats.get(actor.id);
          if (s) { s.activations += 1; if (isRaging(actor)) s.ragingActivations += 1; }
        }

        let result;
        try {
          result = applyCommand(state, command);
        } catch (error) {
          return { error: `applyCommand(${command.type}): ${error.message}`, squadA, squadB, seed, aSeat };
        }
        // The CPU plans against EXPECTED values, so a rolled outcome can invalidate the
        // tail of its own sequence. The real driver tolerates this the same way: keep the
        // accepted prefix and drop the rest.
        if (!result.accepted) break;

        const next = result.nextState;

        if (actor) {
          const s = stats.get(actor.id);
          if (s) {
            if (command.type === "USE_ART") {
              s.artUses[command.artId] = (s.artUses[command.artId] ?? 0) + 1;
            } else if (command.type === "ATTACK") {
              s.basicAttacks += 1;
            } else if (command.type === "DEFEND") {
              s.defends += 1;
            }
            const after = findUnit(next, actor.id);
            const mpAfter = after ? (after.mp ?? 0) : mpBefore;
            if (mpAfter < mpBefore) s.mpSpent += mpBefore - mpAfter;
          }
        }

        // Attribute every HP change in this command to the acting unit — or, when a summon
        // is acting, to the unit that summoned it.
        const actorPlayer = actor ? actor.player : null;
        const actorStat = actor ? creditStatFor(state, actor) : null;
        for (const unit of next.units) {
          const prevHp = before.get(unit.id);
          if (prevHp === undefined) continue; // a unit summoned by this command
          const delta = prevHp - unit.hp;
          if (delta === 0) continue;
          const victimStat = stats.get(unit.id);
          const sameSide = actorPlayer !== null && unit.player === actorPlayer;

          if (delta > 0) {
            if (victimStat) victimStat.damageTaken += delta;
            if (actorStat && !sameSide) actorStat.damageDealt += delta;
            else if (!actorStat) hazardDamage += delta;
            if (prevHp > 0 && unit.hp <= 0 && actorStat && !sameSide) actorStat.kills += 1;
            if (prevHp > 0 && unit.hp <= 0 && victimStat) victimStat.died = 1;
          } else {
            const healed = -delta;
            if (victimStat) victimStat.healingReceived += healed;
            if (actorStat && sameSide) actorStat.healingDone += healed;
          }
        }

        state = next;
        if (state.phase !== "playing") break;
      }

      activations += 1;
      if (state.phase === "playing" && state.revision === revisionBefore) { drawReason = "stall"; break; }
    }

    if (state.phase === "playing" && activations >= ACTIVATION_CAP) drawReason = "cap";

    for (const unit of state.units) {
      const s = stats.get(unit.id);
      if (!s) continue;
      const max = startHp.get(unit.id) || 1;
      s.finalHpPct = Math.max(0, unit.hp) / max;
      if (unit.hp <= 0) s.died = 1;
    }

    let outcome = "draw";
    if (state.winner === aSeat) outcome = "A";
    else if (state.winner === bSeat) outcome = "B";

    // Roll telemetry up per unit TYPE and side, which is what the analysis consumes.
    const perType = {};
    for (const [id, s] of stats) {
      const type = typeById.get(id);
      const side = playerById.get(id) === aSeat ? "A" : "B";
      const key = `${side}:${type}`;
      const bucket = (perType[key] ??= { ...newUnitStat(), instances: 0, artUses: {} });
      bucket.instances += 1;
      for (const k of Object.keys(s)) {
        if (k === "artUses") {
          for (const [artId, n] of Object.entries(s.artUses)) bucket.artUses[artId] = (bucket.artUses[artId] ?? 0) + n;
        } else {
          bucket[k] += s[k];
        }
      }
    }

    return {
      squadA, squadB, seed, aSeat, outcome, activations, drawReason,
      hpA: hpRemaining(state, aSeat), hpB: hpRemaining(state, bSeat),
      hazardDamage, perType
    };
  }

  const withNames = (result, job) => (job.nameA ? { ...result, nameA: job.nameA, nameB: job.nameB } : result);

  // Results are streamed back in batches rather than held until the end. A long run is
  // worth checkpointing: an earlier 20k-match run was killed at 34% and lost everything,
  // because nothing reached disk until the final write.
  let batch = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    batch.push(withNames(playMatch(job.squadA, job.squadB, job.seed, job.aSeat), job));
    if (batch.length >= 25) {
      parentPort.postMessage({ progress: batch.length, results: batch });
      batch = [];
    }
  }
  parentPort.postMessage({ progress: batch.length, results: batch, done: true });
}

// ---- main ------------------------------------------------------------------
if (isMainThread) {
  const { UNIT_TYPES } = await import(src("src/core/unitRegistry.js"));
  const roster = Object.entries(UNIT_TYPES)
    .filter(([, def]) => !def.summon)
    .map(([id]) => id)
    .sort();

  const GAMES = Number(arg("games", 2000));
  const DIFFICULTY = arg("difficulty", "hard");
  const SIZE = Number(arg("size", 13));
  const SEED = Number(arg("seed", 12345));
  const WORKERS = Number(arg("workers", Math.max(1, Math.min(os.cpus().length - 2, 10))));
  const OUT = resolve(ROOT, arg("out", `balance-data/sim-${DIFFICULTY}.json`));

  // Each sampled pairing is played BOTH ways (A in seat 1 and A in seat 2) on the same
  // seed so corner-spawn and first-turn advantage cancel out instead of contaminating
  // the ratings. GAMES counts individual matches, so pairings = GAMES / 2.
  const rand = mulberry32(SEED);
  const jobs = [];

  // Two modes. Default: sample random squads across the whole roster, which is what
  // produces unbiased per-unit ratings. With --comps: play a round-robin among named
  // squads from a JSON file, which is how a shortlist gets VERIFIED head-to-head after
  // the model proposes it. Both feed the identical telemetry pipeline.
  const COMPS_FILE = arg("comps", null);
  if (COMPS_FILE) {
    const comps = JSON.parse(readFileSync(resolve(ROOT, COMPS_FILE), "utf8"));
    const names = Object.keys(comps);
    const seeds = Number(arg("seeds", 40));
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        for (let s = 0; s < seeds; s += 1) {
          const seed = (s * 2 + 1) >>> 0;
          const base = { squadA: comps[names[i]], squadB: comps[names[j]], seed, nameA: names[i], nameB: names[j] };
          jobs.push({ ...base, aSeat: 1 }, { ...base, aSeat: 2 });
        }
      }
    }
    console.log(`Comp round-robin — ${names.length} comps, ${seeds} seeds, difficulty=${DIFFICULTY}, board=${SIZE}`);
    console.log(`${jobs.length} matches across ${WORKERS} workers.`);
  } else {
    const pairings = Math.max(1, Math.floor(GAMES / 2));
    for (let p = 0; p < pairings; p += 1) {
      const squadA = sampleSquad(rand, roster);
      const squadB = sampleSquad(rand, roster);
      const seed = (p * 2 + 1) >>> 0;
      jobs.push({ squadA, squadB, seed, aSeat: 1 });
      jobs.push({ squadA, squadB, seed, aSeat: 2 });
    }
    console.log(`Roster sim — ${roster.length} draftable units, difficulty=${DIFFICULTY}, board=${SIZE}`);
    console.log(`${jobs.length} matches (${pairings} pairings x 2 sides) across ${WORKERS} workers.`);
  }

  // Contiguous chunks keep each pairing's two orientations in the same worker, which
  // makes a partial/aborted run still internally balanced.
  const chunks = Array.from({ length: WORKERS }, () => []);
  for (let i = 0; i < jobs.length; i += 2) {
    const w = Math.floor(i / 2) % WORKERS;
    chunks[w].push(jobs[i], jobs[i + 1]);
  }

  const startedAt = Date.now();
  let completed = 0;
  let lastLog = 0;
  let lastCheckpoint = 0;
  const collected = [];

  mkdirSync(dirname(OUT), { recursive: true });

  // A checkpoint is a complete, analyzable file — balance-report.mjs can be pointed at it
  // mid-run. Written to a temp path and renamed so a kill mid-write can't corrupt it.
  const writeOut = (final) => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const clean = collected.filter((r) => !r.error);
    const payload = {
      meta: {
        generatedBy: "scripts/roster-sim.mjs",
        difficulty: DIFFICULTY, size: SIZE, seed: SEED,
        games: clean.length, errored: collected.length - clean.length,
        decided: clean.filter((r) => r.outcome !== "draw").length,
        roster, squadSize: SQUAD_SIZE, activationCap: ACTIVATION_CAP,
        elapsedSeconds: Number(elapsed.toFixed(1)),
        complete: Boolean(final),
        plannedGames: jobs.length
      },
      results: clean
    };
    const tmp = `${OUT}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload));
    renameSync(tmp, OUT);
  };

  const runWorker = (chunk) => new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: { jobs: chunk, difficulty: DIFFICULTY, size: SIZE },
      execArgv: ["--preserve-symlinks", "--preserve-symlinks-main"]
    });
    worker.on("message", (msg) => {
      completed += msg.progress ?? 0;
      if (msg.results?.length) collected.push(...msg.results);

      const now = Date.now();
      if (now - lastLog > 15000) {
        lastLog = now;
        const elapsed = (now - startedAt) / 1000;
        const rate = completed / elapsed;
        const eta = rate > 0 ? (jobs.length - completed) / rate : 0;
        console.log(`  ${completed}/${jobs.length} matches (${(100 * completed / jobs.length).toFixed(1)}%) — ${rate.toFixed(1)}/s, ETA ${(eta / 60).toFixed(1)} min`);
      }
      if (completed - lastCheckpoint >= 1000) {
        lastCheckpoint = completed;
        writeOut(false);
      }
      if (msg.done) resolveWorker();
    });
    worker.on("error", rejectWorker);
    worker.on("exit", (code) => { if (code !== 0) rejectWorker(new Error(`worker exited ${code}`)); });
  });

  await Promise.all(chunks.filter((c) => c.length).map(runWorker));
  const results = collected;

  const errors = results.filter((r) => r.error);
  if (errors.length) {
    console.error(`\n${errors.length} matches errored. First 5:`);
    for (const e of errors.slice(0, 5)) console.error(`  ${e.error} — ${e.squadA?.join("/")} vs ${e.squadB?.join("/")}`);
  }

  const clean = results.filter((r) => !r.error);
  const decided = clean.filter((r) => r.outcome !== "draw").length;
  const elapsed = (Date.now() - startedAt) / 1000;

  writeOut(true);

  console.log(`\nDone in ${(elapsed / 60).toFixed(1)} min — ${clean.length} matches, ${decided} decided (${(100 * decided / clean.length).toFixed(1)}%), ${errors.length} errored.`);
  console.log(`Wrote ${OUT}`);
}
