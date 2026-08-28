// Local named Trick Shot Lab layouts. HORSE reads this same bank and offers ALL
// of it, so a player can author a library once in the Lab and set those shots
// without rebuilding the room every match.
//
// It used to be filtered to bin layouts there, because a bin was the only target
// HORSE had. HORSE places both kinds now, so a saved hoop layout is no longer
// silently missing from a list the player authored it into — which is the worst
// shape a filter can take.

import { normalizeTrickShot } from "../sim/trick-shot.js";
import { readJSON, resolveStorage, writeJSON } from "./local-storage.js";

const STORAGE_KEY = "miniHoops.trickShots.v1";
const BANK_LIMIT = 40;
const copy = (value) => JSON.parse(JSON.stringify(value));

function defaultId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `trick-${Date.now().toString(36)}-${random}`;
}

export function createTrickShotStore({ storage, now = () => Date.now(), makeId = defaultId } = {}) {
  const backing = resolveStorage(storage);
  const raw = readJSON(backing, STORAGE_KEY, []);
  let shots = Array.isArray(raw)
    ? raw.map(normalizeTrickShot).filter((shot) => shot.id).slice(0, BANK_LIMIT)
    : [];

  function persist() {
    writeJSON(backing, STORAGE_KEY, shots);
  }

  return {
    list() {
      return copy([...shots].sort((a, b) => b.updatedAt - a.updatedAt));
    },

    get(id) {
      const shot = shots.find((candidate) => candidate.id === id);
      return shot ? copy(shot) : null;
    },

    save(draft) {
      const current = shots.find((shot) => shot.id === draft?.id);
      const timestamp = Math.max(0, Number(now()) || 0);
      const normalized = normalizeTrickShot({
        ...draft,
        id: current?.id || makeId(),
        createdAt: current?.createdAt || timestamp,
        updatedAt: timestamp,
      });
      shots = [normalized, ...shots.filter((shot) => shot.id !== normalized.id)].slice(0, BANK_LIMIT);
      persist();
      return copy(normalized);
    },

    remove(id) {
      const next = shots.filter((shot) => shot.id !== id);
      if (next.length === shots.length) return false;
      shots = next;
      persist();
      return true;
    },
  };
}
