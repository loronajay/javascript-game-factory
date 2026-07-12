const RIOT_COP_LINES = Object.freeze([
  Object.freeze({ speaker: "riot-cop", type: "riot-cop", name: "John", skin: null, side: "right", player: 2 }),
  Object.freeze({ speaker: "riot-cop", type: "riot-cop", name: "Mara", skin: "swat-team", side: "right", player: 2 }),
  Object.freeze({ speaker: "riot-cop", type: "riot-cop", name: "Brock", skin: "firefighter", side: "right", player: 2 }),
  Object.freeze({ speaker: "riot-cop", type: "riot-cop", name: "Sunny", skin: "street-patrol", side: "right", player: 2 }),
]);

export function riotCopLine(index, text) {
  return { ...RIOT_COP_LINES[index], text };
}

export function firstLivingPlayerUnit(state) {
  return (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0) ?? null;
}

export function fatSquadUnit(state, type) {
  return (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === type) ?? null;
}
