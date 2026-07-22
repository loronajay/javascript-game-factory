// Online lobby view rendering — the roster list and the draft/ban board — extracted
// from onlineFlow.js so that file keeps the lobby state machine and transport wiring
// while the DOM-heavy rendering lives here. These functions are read-only over lobby
// state: `createLobbyView(ctx)` closes over a context of getters (getLobby/getDraft/…),
// derived helpers (matchTypeConfig, localLobbySeat, draftPlayerLabel, …) and action
// callbacks (submitDraftPick/submitBan/openLocalFormation) the controller supplies. The
// only state they write is formationPromptOpen, through ctx.setFormationPromptOpen, so
// the controller stays the single owner of lobby state.
//
// ctx shape:
//   Elements: rosterEl, draftField, draftHint, draftTrack, draftSquads, draftActions,
//             draftRoster
//   Getters:  getLobby(), getDraft(), getMyClientId(), getLocalLocked(),
//             getLocalFormationOrder(), getFormationPromptOpen()
//   Setters:  setFormationPromptOpen(bool)
//   Shared:   readyByClientId (Map)
//   Helpers:  activeMatchType(), isDraftMatch(), matchTypeConfig(), playerCount(),
//             localLobbySeat(), draftPlayerLabel(seat)
//   Actions:  submitDraftPick(type), submitBan(type), openLocalFormation()

import { UNIT_TYPES } from "../core/unitCatalog.js";
import { UNIT_TYPE_KEYS, groupedUnitTypes, isUnitUnlocked } from "./squadModel.js";
import { createPortrait } from "./portraits.js";
import {
  DRAFT_PICK_ORDER,
  bannedTypes,
  canBanType,
  canDraftType,
  currentBanSeat,
  currentDraftSeat,
  draftPhase,
  draftedTypes,
  isDraftComplete,
} from "./draftModel.js";
import { playerSeatListLabel, teamForSeat, teamGroupsForSetup } from "./teamDisplay.js";
import { escapeHtml } from "./domHelpers.js";
import { PLAYER_COLOR, TEAM_COLOR } from "./onlineFlowColors.js";

export function createLobbyView(ctx) {
  function renderRoster() {
    const { rosterEl } = ctx;
    rosterEl.replaceChildren();
    const lobby = ctx.getLobby();
    const myClientId = ctx.getMyClientId();
    const draft = ctx.getDraft();
    const teams = ctx.activeMatchType() === "teams4";
    const draftMode = ctx.isDraftMatch();
    rosterEl.classList.toggle("is-team-roster", teams);
    const players = lobby?.players ?? [];
    const renderPlayer = (p) => {
      const li = document.createElement("li");
      li.className = "lobby-roster-item";
      const tags = [];
      if (p.id === lobby?.ownerId) tags.push('<span class="lobby-tag host">Host</span>');
      if (p.id === myClientId) tags.push('<span class="lobby-tag you">You</span>');
      if (draftMode) {
        const pickCount = draft?.picks?.[p.seat]?.length ?? 0;
        tags.push(
          ctx.readyByClientId.get(p.id) === true
            ? '<span class="lobby-tag ready">Formation</span>'
            : pickCount >= 4
            ? '<span class="lobby-tag ready">Drafted</span>'
            : '<span class="lobby-tag picking">Drafting</span>',
        );
      } else {
        tags.push(
          ctx.readyByClientId.get(p.id) === true
            ? '<span class="lobby-tag ready">Locked</span>'
            : '<span class="lobby-tag picking">Picking</span>',
        );
      }
      if (teams) {
        const team = teamForSeat(p.seat, "teams");
        li.style.setProperty("--team", TEAM_COLOR[team] ?? PLAYER_COLOR[1]);
        tags.push(`<span class="lobby-tag team">Team ${team}</span>`);
      } else {
        li.style.setProperty("--team", PLAYER_COLOR[p.seat] ?? PLAYER_COLOR[1]);
      }
      li.innerHTML =
        `<span class="lobby-seat">${p.seat}</span>` +
        `<span class="lobby-name">${escapeHtml(p.name)}</span>` +
        `<span class="lobby-tags">${tags.join("")}</span>`;
      rosterEl.appendChild(li);
    };
    if (teams) {
      for (const group of teamGroupsForSetup(4, "teams")) {
        const header = document.createElement("li");
        header.className = "lobby-team-heading";
        header.style.setProperty("--team", TEAM_COLOR[group.team] ?? PLAYER_COLOR[1]);
        header.innerHTML = `<span>Team ${group.team}</span><small>${playerSeatListLabel(group.seats)}</small>`;
        rosterEl.appendChild(header);
        for (const seat of group.seats) {
          const player = players.find((candidate) => candidate.seat === seat);
          if (player) renderPlayer(player);
        }
      }
    } else {
      for (const p of players) renderPlayer(p);
    }
  }

  function renderDraft() {
    const { draftField, draftHint, draftTrack, draftSquads, draftActions, draftRoster } = ctx;
    if (!draftField || draftField.hidden) return;
    const draft = ctx.getDraft();
    const full = ctx.playerCount() === ctx.matchTypeConfig().maxPlayers;
    if (!full || !draft) {
      draftHint.textContent = "Draft starts when both commanders are in the room.";
      draftTrack.replaceChildren();
      draftSquads.replaceChildren();
      draftActions.replaceChildren();
      draftRoster.replaceChildren();
      return;
    }

    if (draftPhase(draft) === "ban") {
      renderBanPhase();
      return;
    }

    const currentSeat = currentDraftSeat(draft);
    const localSeat = ctx.localLobbySeat();
    const localLocked = ctx.getLocalLocked();
    const complete = isDraftComplete(draft);
    draftHint.textContent = complete
      ? (localLocked ? "Formation locked. The host can start once both sides are ready." : "Draft complete. Arrange your starting slots before the match starts.")
      : currentSeat === localSeat
        ? "Your pick. Choose one available unit for your squad."
        : `${ctx.draftPlayerLabel(currentSeat)} is picking. Taken units are locked for both sides.`;

    draftTrack.replaceChildren();
    for (let i = 0; i < DRAFT_PICK_ORDER.length; i += 1) {
      const seat = DRAFT_PICK_ORDER[i];
      const dot = document.createElement("span");
      dot.className = `draft-step${i < draft.pickIndex ? " is-done" : ""}${i === draft.pickIndex ? " is-current" : ""}`;
      dot.style.setProperty("--team", PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]);
      dot.textContent = String(i + 1);
      draftTrack.appendChild(dot);
    }

    draftSquads.replaceChildren();
    for (const seat of [1, 2]) {
      const panel = document.createElement("section");
      panel.className = `draft-side${seat === currentSeat && !complete ? " is-picking" : ""}`;
      panel.style.setProperty("--team", PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]);
      const title = document.createElement("h3");
      title.textContent = ctx.draftPlayerLabel(seat);
      const list = document.createElement("div");
      list.className = "draft-picks";
      const picks = draft.picks?.[seat] ?? [];
      const skins = draft.skins?.[seat] ?? [];
      const nicknames = draft.nicknames?.[seat] ?? [];
      for (let i = 0; i < 4; i += 1) {
        const type = picks[i];
        const slot = document.createElement("div");
        slot.className = `draft-pick${type ? " is-filled" : ""}`;
        if (type) {
          slot.append(createPortrait(type, { variant: "is-chip", eager: true, skin: skins[i] ?? null }));
          const name = document.createElement("span");
          name.textContent = nicknames[i] || UNIT_TYPES[type]?.name || type;
          slot.append(name);
        } else {
          slot.textContent = `Pick ${i + 1}`;
        }
        list.appendChild(slot);
      }
      panel.append(title, list);
      draftSquads.appendChild(panel);
    }

    const taken = draftedTypes(draft);
    draftActions.replaceChildren();
    if (complete) {
      const arrangeBtn = document.createElement("button");
      arrangeBtn.type = "button";
      arrangeBtn.className = `menu-btn${localLocked ? "" : " primary"}`;
      arrangeBtn.textContent = localLocked ? "Change Formation" : "Arrange Formation";
      arrangeBtn.addEventListener("click", () => ctx.openLocalFormation());
      const status = document.createElement("p");
      status.className = "setup-hint";
      status.textContent = localLocked ? "Your formation is locked." : "Pick your spawn-slot order.";
      draftActions.append(arrangeBtn, status);
      draftRoster.replaceChildren();
      if (!localLocked && !ctx.getLocalFormationOrder() && !ctx.getFormationPromptOpen() && localSeat) {
        ctx.setFormationPromptOpen(true);
        window.setTimeout(() => { ctx.setFormationPromptOpen(false); ctx.openLocalFormation(); }, 0);
      }
      return;
    }

    draftRoster.replaceChildren();
    for (const group of groupedUnitTypes(UNIT_TYPE_KEYS)) {
      const section = document.createElement("section");
      section.className = "draft-class";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const units = document.createElement("div");
      units.className = "draft-class-units";
      for (const type of group.types) {
        const locked = !isUnitUnlocked(type);
        const disabled = complete || currentSeat !== localSeat || !canDraftType(draft, localSeat, type);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `draft-unit${taken.has(type) ? " is-taken" : ""}${locked ? " is-locked" : ""}`;
        btn.disabled = disabled;
        btn.dataset.type = type;
        btn.append(createPortrait(type, { variant: "is-card", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name ?? type;
        btn.append(name);
        if (locked) {
          const flag = document.createElement("i");
          flag.textContent = "🔒 Locked";
          btn.append(flag);
        } else if (taken.has(type)) {
          const flag = document.createElement("i");
          flag.textContent = "Taken";
          btn.append(flag);
        }
        btn.addEventListener("click", () => ctx.submitDraftPick(type));
        units.appendChild(btn);
      }
      section.append(heading, units);
      draftRoster.appendChild(section);
    }
  }

  function renderBanPhase() {
    const { draftHint, draftTrack, draftSquads, draftActions, draftRoster } = ctx;
    const draft = ctx.getDraft();
    const localSeat = ctx.localLobbySeat();
    const banSeat = currentBanSeat(draft);
    const banned = bannedTypes(draft);

    draftHint.textContent = banSeat === localSeat
      ? "Ban phase — ban one enemy unit from the match."
      : `${ctx.draftPlayerLabel(banSeat)} is banning. One ban each.`;

    draftTrack.replaceChildren();
    for (let i = 0; i < draft.banOrder.length; i += 1) {
      const seat = draft.banOrder[i];
      const dot = document.createElement("span");
      dot.className = `draft-step${i < draft.banIndex ? " is-done" : ""}${i === draft.banIndex ? " is-current" : ""}`;
      dot.style.setProperty("--team", PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]);
      dot.textContent = "⊘";
      draftTrack.appendChild(dot);
    }

    draftSquads.replaceChildren();
    if (banned.size) {
      const strip = document.createElement("section");
      strip.className = "draft-side";
      const list = document.createElement("div");
      list.className = "draft-picks";
      for (const type of banned) {
        const slot = document.createElement("div");
        slot.className = "draft-pick is-filled is-banned";
        slot.append(createPortrait(type, { variant: "is-chip", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name || type;
        slot.append(name);
        list.appendChild(slot);
      }
      strip.append(Object.assign(document.createElement("h3"), { textContent: "Banned" }), list);
      draftSquads.appendChild(strip);
    }

    draftActions.replaceChildren();
    draftRoster.replaceChildren();
    for (const group of groupedUnitTypes(UNIT_TYPE_KEYS)) {
      const section = document.createElement("section");
      section.className = "draft-class";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const units = document.createElement("div");
      units.className = "draft-class-units";
      for (const type of group.types) {
        // Bans cover the whole roster, including units you don't own — no lock state.
        const isBanned = banned.has(type);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `draft-unit${isBanned ? " is-taken is-banned" : ""}`;
        btn.disabled = banSeat !== localSeat || !canBanType(draft, localSeat, type);
        btn.dataset.type = type;
        btn.append(createPortrait(type, { variant: "is-card", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name ?? type;
        btn.append(name);
        if (isBanned) {
          const flag = document.createElement("i");
          flag.textContent = "Banned";
          btn.append(flag);
        }
        btn.addEventListener("click", () => ctx.submitBan(type));
        units.appendChild(btn);
      }
      section.append(heading, units);
      draftRoster.appendChild(section);
    }
  }

  return { renderRoster, renderDraft };
}
