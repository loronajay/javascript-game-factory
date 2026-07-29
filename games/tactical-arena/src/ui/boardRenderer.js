import { svgElement } from "./svgHelpers.js";
import { createUnitFigure } from "./unitRenderer.js";
import { createBoardMetrics, createBoardViewBox, gridToScreen, pointsToString } from "./isometric.js";
import { updateBoardTouchAssist } from "./boardTouchAssist.js";
import { followBoardSelection, updateBoardCamera } from "./boardCameraController.js";
import { getArt, getAuraSources, getEffectiveStats } from "../core/unitCatalog.js";
import { areEnemies, colorOf, getTileAffinity, unitAt } from "../core/state.js";
import { canTrample, chebyshevDistance, getLegalMoves, getTrampleMoveOptions, isOnBoard, positionFromKey, positionKey } from "../rules/movement.js";
import { isShotBlocked, isStraightRayTarget, isWallBetween, requiresRayBasicAttack } from "../rules/combat.js";
import { artIsBodyBlocked, getArtTargetRange, getConeAimOptions, getConeCells, getFirePlacementTiles, getFlightTiles, getFootworkStepOptions, getLegalFleeTiles, getLineReachTiles, getLineTargets, getProtectLandingTiles, getPyroclasmReachTiles, getPyroclasmTargets, getRevivePlacementTiles, getRushStepOptions, getSelfBlastRadius, getSummonPlacementTiles, getTargetedBlastAimTiles, getWallPlacementTiles } from "../rules/arts.js";
import { isTargetable } from "../rules/statuses.js";
import { setSceneWeather } from "./sceneBackdrop.js";
import { createFireFigure, createWallFigure, getActiveBoardWeather } from "./boardAtmosphere.js";
import { ensureBoardGeometry, reconcileUnitLayer, tileClassName, updateWeatherLayer } from "./boardDomReconciler.js";
import { wireTargetedBlastHover, wireVolleyHover } from "./boardHoverPreview.js";

function createTile(metrics, position, { affinity, selected, legal, targetKind, path, range, aura }) {
  const point = gridToScreen(metrics, position.x, position.y);
  const hw = metrics.tileWidth / 2;
  const hh = metrics.tileHeight / 2;
  const top = [[point.x, point.y], [point.x + hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x - hw, point.y + hh]];
  const left = [[point.x - hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x - hw, point.y + hh + metrics.depth]];
  const right = [[point.x + hw, point.y + hh], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x + hw, point.y + hh + metrics.depth]];
  const classes = ["tile", affinity === "light" ? "tile-light" : "tile-dark"];
  if (selected) classes.push("selected");
  if (range) classes.push(`${range}-range`);
  if (legal) classes.push(`legal-${targetKind}`);
  if (path) classes.push("path");
  // Always-on Deathly Aura tint — lowest priority, so it only paints when no
  // brighter action highlight (legal / range / path / selection) claims the tile.
  if (aura) classes.push("aura-zone", `aura-zone--p${aura}`);
  const tile = svgElement("g", { class: classes.join(" ") });
  tile.append(
    svgElement("polygon", { class: "tile-side-a", points: pointsToString(left) }),
    svgElement("polygon", { class: "tile-side-b", points: pointsToString(right) }),
    svgElement("polygon", { class: "tile-face", points: pointsToString(top) })
  );
  return tile;
}

export function isTargetedMode(mode, actor) {
  if (mode === "attack") return true;
  if (!actor || !mode?.startsWith("art:")) return false;
  const art = getArt(actor.type, mode.slice("art:".length));
  return Boolean(
    art &&
    art.targeting?.shape !== "cone" &&
    art.effect?.type !== "healAllies" &&
    art.resolution !== "flee" &&
    art.resolution !== "summon" &&
    art.resolution !== "summonGhost" &&
    art.targeting?.shape !== "nukeAura" &&
    art.targeting?.shape !== "tilePlacement" &&
    // Father Time's ally-or-enemy casts (Age, Time Stretch) and Rewind's revive
    // placement do their own highlighting below, not the enemy-only targeted wash.
    art.targeting?.shape !== "allyOrEnemy" &&
    art.targeting?.shape !== "revive" &&
    // Juggernaut's line abilities (Tether Grab / Rocket Punch) highlight their own
    // first-contact ray targets below, not the Chebyshev box.
    art.targeting?.shape !== "lineAny" &&
    art.targeting?.shape !== "lineEnemy" &&
    // Angel's Anoint is friendly-only — it does its own ally highlighting below.
    art.targeting?.shape !== "ally" &&
    art.targeting?.shape !== "protectAlly" &&
    // Gargoyle's Flight (empty-tile reposition) and Pyroclasm (self-centred line burst)
    // do their own highlighting below, not the enemy-only Chebyshev box.
    art.targeting?.shape !== "flightMove" &&
    art.targeting?.shape !== "lineBurst" &&
    // Clod's Thunderous Charge picks a tile (targetedBlast) — it highlights its own aim
    // tiles + hover footprint below, not the enemy-only Chebyshev box.
    art.targeting?.shape !== "targetedBlast"
  );
}

export function isHealArtConfirmTile(state, actor, art, position) {
  if (!state || !actor || !art || art.effect?.type !== "healAllies" || !position || !isOnBoard(state, position)) return false;

  if (art.effect.global || art.targeting?.shape === "globalAllies") return true;

  if (art.targeting?.shape === "selfAura") {
    const radius = art.targeting.radius ?? art.effect.radius ?? 3;
    return chebyshevDistance(actor.position, position) <= radius;
  }

  const clicked = unitAt(state, position);
  return Boolean(clicked && clicked.hp > 0 && clicked.player === actor.player);
}

export function renderBoard({ board, boardLayer, weatherLayer = null, unitsLayer, state, mode, selectedId, footworkPath, onTileClick, onAreaHover = null, onUnitHover = null }) {
  let legal = new Set();
  let range = new Set();
  const actor = selectedId ? state.units.find((u) => u.id === selectedId) : null;
  const targeted = isTargetedMode(mode, actor);

  // RAGE Trample (Fat Knight): targeted exactly like Footwork/Stumble's rushPath —
  // one adjacent tile at a time via footworkPath — instead of the plain
  // click-anywhere-in-range destination set every other unit's move uses.
  if (mode === "move") legal = (actor && canTrample(actor)) ? getTrampleMoveOptions(state, actor, footworkPath) : getLegalMoves(state, actor);

  if (actor && targeted) {
    // Basic attacks are body-blocked unless the attacker has an explicit pierce passive
    // (Sniper). Physical ARTS can opt out with pierceUnits (Curve Shot), and magic
    // strike ARTS reach through bodies, so their range wash and targets stay unculled.
    const art = mode?.startsWith("art:") ? getArt(actor.type, mode.slice("art:".length)) : null;
    const reach = art ? getArtTargetRange(state, actor, art) : getEffectiveStats(actor, state).attackRange;
    const blockable = mode === "attack" || artIsBodyBlocked(art);
    // Big Brother's Super Magnet: basic attacks must land on one of the 8 straight
    // rays out of the actor, so the wash/target set is culled to those rays instead
    // of the full Chebyshev square — mirrors the reducer's requiresRayBasicAttack gate.
    const rayOnly = mode === "attack" && requiresRayBasicAttack(actor);
    for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
      for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
        const cell = { x, y };
        if (!isOnBoard(state, cell)) continue;
        if (chebyshevDistance(actor.position, cell) === 0) continue;
        if (rayOnly && !isStraightRayTarget(actor.position, cell)) continue;
        if (blockable && isShotBlocked(state, actor.position, cell, actor)) continue;
        // A wall blocks the line for EVERY ranged ability (physical or magic), so it
        // culls the wash unconditionally — only the Sniper's pierce reaches through.
        if (isWallBetween(state, actor.position, cell, actor)) continue;
        range.add(positionKey(cell));
      }
    }
    for (const target of state.units) {
      if (isTargetable(target) && areEnemies(actor, target) && chebyshevDistance(actor.position, target.position) <= reach &&
          !(rayOnly && !isStraightRayTarget(actor.position, target.position)) &&
          !(blockable && isShotBlocked(state, actor.position, target.position, actor)) &&
          !isWallBetween(state, actor.position, target.position, actor)) {
        legal.add(positionKey(target.position));
      }
    }
    // In attack mode, an in-range wall with a clear shot is itself a legal target
    // (you can destroy cover). A body or another wall between still blocks it; the
    // Sniper's pierce reaches a covered wall.
    if (mode === "attack" || art?.id === "blasting-cap") {
      for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
        if (obj.kind !== "wall") continue;
        const [wx, wy] = key.split(",").map(Number);
        const pos = { x: wx, y: wy };
        if (chebyshevDistance(actor.position, pos) <= reach &&
            !(rayOnly && !isStraightRayTarget(actor.position, pos)) &&
            (art?.id === "blasting-cap" || !isShotBlocked(state, actor.position, pos, actor)) &&
            !isWallBetween(state, actor.position, pos, actor)) {
          legal.add(key);
        }
      }
    }
  }

  let volleyCones = null;
  if (actor && mode?.startsWith("art:")) {
    const coneArt = getArt(actor.type, mode.slice("art:".length));
    if (coneArt?.targeting?.shape === "cone") {
      volleyCones = getConeAimOptions(state, actor).map((origin) => ({
      origin,
      key: positionKey(origin),
        cells: (getConeCells(state, actor, origin, coneArt) ?? []).map(positionKey)
      }));
      for (const cone of volleyCones) for (const k of cone.cells) range.add(k);
      legal = new Set(volleyCones.map((cone) => cone.key));
    }
  }

  if (actor && mode === "footwork") legal = getFootworkStepOptions(state, actor, footworkPath);
  if (actor && mode?.startsWith("art:")) {
    const rushArt = getArt(actor.type, mode.slice("art:".length));
    if (rushArt?.targeting?.shape === "rushPath") legal = getRushStepOptions(state, actor, footworkPath, rushArt);
  }
  if (actor && mode?.startsWith("art:")) {
    const fleeArt = getArt(actor.type, mode.slice("art:".length));
    if (fleeArt?.targeting?.shape === "flee" || fleeArt?.resolution === "flee") legal = getLegalFleeTiles(state, actor, fleeArt);
  }
  // Flight: fly onto a highlighted empty tile (Chebyshev, diagonals allowed).
  if (actor && mode === "art:flight") legal = getFlightTiles(state, actor, getArt(actor.type, "flight"));
  if (actor && mode?.startsWith("art:")) {
    const summonArt = getArt(actor.type, mode.slice("art:".length));
    if (summonArt?.targeting?.shape === "placement" && (summonArt.resolution === "summon" || summonArt.resolution === "summonGhost")) {
      legal = getSummonPlacementTiles(state, actor, summonArt);
    }
  }
  if (actor && mode === "art:build-cover") legal = getWallPlacementTiles(state, actor, getArt(actor.type, "build-cover"));
  if (actor && mode === "art:shaft-prop") legal = getWallPlacementTiles(state, actor, getArt(actor.type, "shaft-prop"));
  if (actor && mode === "art:throw-cigar") legal = getFirePlacementTiles(state, actor, getArt(actor.type, "throw-cigar"));
  // Revive arts place a fallen ally on an empty tile within range (same rule as a summon).
  if (actor && mode?.startsWith("art:")) {
    const reviveArt = getArt(actor.type, mode.slice("art:".length));
    if (reviveArt?.targeting?.shape === "revive") legal = getRevivePlacementTiles(state, actor, reviveArt);
  }

  if (actor && mode?.startsWith("art:")) {
    const protectArt = getArt(actor.type, mode.slice("art:".length));
    if (protectArt?.targeting?.shape === "protectAlly") {
      const reach = getArtTargetRange(state, actor, protectArt);
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (let dy = -reach; dy <= reach; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) continue;
          const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
          if (isOnBoard(state, pos)) range.add(positionKey(pos));
        }
      }
      for (const u of state.units) {
        if (u.hp <= 0 || u.player !== actor.player || u.id === actor.id) continue;
        for (const key of getProtectLandingTiles(state, actor, u, protectArt)) legal.add(key);
      }
    }
  }

  // Self-centred AoE blasts (Dark Bomb, Nuke): preview the whole detonation
  // footprint as a range wash and light every enemy caught inside as a legal
  // target, so the player sees who dies before committing the MP.
  let nukeArt = null;
  if (actor && mode?.startsWith("art:")) {
    const candidate = getArt(actor.type, mode.slice("art:".length));
    if (candidate?.targeting?.shape === "nukeAura") {
      nukeArt = candidate;
      const radius = getSelfBlastRadius(state, actor, candidate);
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
          const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
          if (isOnBoard(state, pos)) range.add(positionKey(pos));
        }
      }
      for (const u of state.units) {
        if (isTargetable(u) && u.player !== actor.player && chebyshevDistance(actor.position, u.position) <= radius)
          legal.add(positionKey(u.position));
      }
    }
  }

  let isHealArt = false;
  if (actor && mode?.startsWith("art:")) {
    const healArt = getArt(actor.type, mode.slice("art:".length));
    if (healArt?.effect?.type === "healAllies") {
      isHealArt = true;
      if (healArt.effect.global || healArt.targeting?.shape === "globalAllies") {
        for (let x = 0; x < state.size; x += 1) {
          for (let y = 0; y < state.size; y += 1) {
            legal.add(positionKey({ x, y }));
          }
        }
      } else if (healArt.targeting?.shape === "selfAura") {
        const radius = healArt.targeting.radius ?? healArt.effect.radius ?? 3;
        for (let dx = -radius; dx <= radius; dx += 1) {
          for (let dy = -radius; dy <= radius; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
            const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
            if (isOnBoard(state, pos)) legal.add(positionKey(pos));
          }
        }
      } else {
        for (const u of state.units) {
          if (u.hp > 0 && u.player === actor.player) legal.add(positionKey(u.position));
        }
      }
    }
  }

  // Father Time's ally-OR-enemy casts (Age, Time Stretch): a Chebyshev range wash
  // (walls block, bodies don't — these aren't physical strikes) plus every unit in
  // range (ally AND enemy) as a legal target. Marked so the target reticle lights on
  // in-range units below, since the bright tile hides under the figure.
  let isAllyOrEnemyArt = false;
  if (actor && mode?.startsWith("art:")) {
    const utilArt = getArt(actor.type, mode.slice("art:".length));
    if (utilArt?.targeting?.shape === "allyOrEnemy") {
      isAllyOrEnemyArt = true;
      const reach = getArtTargetRange(state, actor, utilArt);
      for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
        for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
          const cell = { x, y };
          if (!isOnBoard(state, cell)) continue;
          if (chebyshevDistance(actor.position, cell) === 0) continue;
          if (isWallBetween(state, actor.position, cell, actor)) continue;
          range.add(positionKey(cell));
        }
      }
      for (const u of state.units) {
        if (!isTargetable(u) || u.id === actor.id) continue;
        if (chebyshevDistance(actor.position, u.position) > reach) continue;
        if (isWallBetween(state, actor.position, u.position, actor)) continue;
        legal.add(positionKey(u.position));
      }
    }
  }

  // Angel's Anoint (shape "ally"): a Chebyshev range wash (walls block, bodies don't —
  // it's a friendly cast) plus every ALLY in range EXCEPT self as a legal target.
  let isAllyArt = false;
  if (actor && mode?.startsWith("art:")) {
    const buffArt = getArt(actor.type, mode.slice("art:".length));
    if (buffArt?.targeting?.shape === "ally") {
      isAllyArt = true;
      const reach = buffArt.targeting?.range ?? getEffectiveStats(actor, state).attackRange;
      for (let x = actor.position.x - reach; x <= actor.position.x + reach; x += 1) {
        for (let y = actor.position.y - reach; y <= actor.position.y + reach; y += 1) {
          const cell = { x, y };
          if (!isOnBoard(state, cell)) continue;
          if (chebyshevDistance(actor.position, cell) === 0) continue;
          range.add(positionKey(cell));
        }
      }
      for (const u of state.units) {
        if (u.hp <= 0 || u.id === actor.id || u.player !== actor.player) continue;
        if (chebyshevDistance(actor.position, u.position) > reach) continue;
        legal.add(positionKey(u.position));
      }
    }
  }

  // Juggernaut's line abilities (Tether Grab / Rocket Punch): always wash the FULL reach
  // of all 8 straight rays so the ability's range reads even when nothing is in line (no
  // more "clicked it and nothing happened"), then light the actual first-contact target as
  // a legal (bright) target. lineAny grabs an ally or enemy; lineEnemy only an enemy (an
  // ally on the ray blocks it, so it is never a legal target).
  let isLineArt = false;
  if (actor && mode?.startsWith("art:")) {
    const lineArt = getArt(actor.type, mode.slice("art:".length));
    const shape = lineArt?.targeting?.shape;
    if (shape === "lineAny" || shape === "lineEnemy") {
      isLineArt = true;
      for (const tile of getLineReachTiles(state, actor, lineArt.targeting.range)) {
        range.add(positionKey(tile));
      }
      for (const { unit: target } of getLineTargets(state, actor, lineArt.targeting.range, { includeAllies: shape === "lineAny" })) {
        legal.add(positionKey(target.position));
      }
    }
  }

  // Gargoyle's Pyroclasm (lineBurst): wash the full reach of all 8 rays and light every
  // enemy standing on a ray as a legal (bright) target — the burst burns through bodies,
  // so a screened enemy is still lit.
  let isPyroclasm = false;
  if (actor && mode?.startsWith("art:")) {
    const burstArt = getArt(actor.type, mode.slice("art:".length));
    if (burstArt?.targeting?.shape === "lineBurst") {
      isPyroclasm = true;
      for (const tile of getPyroclasmReachTiles(state, actor, burstArt)) range.add(positionKey(tile));
      for (const target of getPyroclasmTargets(state, actor, burstArt)) legal.add(positionKey(target.position));
    }
  }

  // Clod's Thunderous Charge (targetedBlast): every legal aim tile is a clickable target
  // (like a placement ART); hovering one previews the 2-tile detonation footprint + the
  // enemies it would catch (wired after the tiles are built, below).
  let blastArt = null;
  if (actor && mode?.startsWith("art:")) {
    const candidate = getArt(actor.type, mode.slice("art:".length));
    if (candidate?.targeting?.shape === "targetedBlast") {
      blastArt = candidate;
      for (const key of getTargetedBlastAimTiles(state, actor, candidate)) legal.add(key);
    }
  }

  const path = new Set(footworkPath.map(positionKey));
  const metrics = createBoardMetrics(state.size);
  const view = createBoardViewBox(metrics, state.size);
  updateBoardTouchAssist(board, { size: state.size, metrics, legalKeys: legal, onTileClick });
  const activeWeather = getActiveBoardWeather(state);
  // The camera returns the base viewBox unchanged on precise pointers and at zoom 1,
  // so desktop framing is identical; on touch it applies the live pan/zoom.
  const camera = updateBoardCamera(board, { size: state.size, metrics, base: view });
  board.setAttribute("viewBox", `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
  // Once the player has zoomed past the whole board, slide the view to whatever they
  // just selected and where it can act. No-op on a mouse and at zoom 1.
  //
  // With nothing selected locally, follow whoever the authoritative state says is
  // activating instead — that is the CPU's or the remote player's piece. Without this
  // the camera simply sat still through the opponent's whole turn and a zoomed-in
  // player watched an empty patch of board.
  const followUnit = actor
    || (state.activation?.unitId ? state.units.find((u) => u.id === state.activation.unitId) : null);
  if (followUnit) {
    const followPoints = [followUnit.position, ...(actor ? [...legal].map(positionFromKey) : [])]
      .filter(Boolean)
      .map((position) => gridToScreen(metrics, position.x, position.y));
    followBoardSelection(board, { actorKey: followUnit.id, points: followPoints });
  }
  board.classList.toggle("board-focused", Boolean(actor));
  board.setAttribute("data-weather", activeWeather ?? "none");
  setSceneWeather(activeWeather);

  // Deathly Aura zones (Necromancer + the Ghoul that carries it), tile → source
  // player for faction tinting. Computed every render and independent of selection
  // so the aura is always visible — the per-tile suppression below keeps it under
  // any brighter action highlight.
  const auraByKey = new Map();
  for (const src of getAuraSources(state)) {
    for (let dx = -src.radius; dx <= src.radius; dx += 1) {
      for (let dy = -src.radius; dy <= src.radius; dy += 1) {
        const pos = { x: src.position.x + dx, y: src.position.y + dy };
        if (isOnBoard(state, pos)) auraByKey.set(positionKey(pos), src.player);
      }
    }
  }

  const boardCache = ensureBoardGeometry(boardLayer, metrics, state, createTile);
  boardCache.onTileClick = onTileClick;
  boardCache.hoverCleanups.forEach((cleanup) => cleanup());
  boardCache.hoverCleanups = [];
  const tileByKey = boardCache.tileByKey;
  const targetKind = mode === "attack" ? "attack" : mode === "move" ? "move" : isHealArt ? "heal" : "art";
  for (const [key, tile] of tileByKey) {
    const position = positionFromKey(key);
    const isLegal = legal.has(key);
    const isSelected = unitAt(state, position)?.id === selectedId;
    const inRange = !isLegal && range.has(key);
    const inPath = path.has(key);
    tile.setAttribute("class", tileClassName({
      affinity: getTileAffinity(state, position),
      selected: isSelected,
      legal: isLegal,
      targetKind,
      path: inPath,
      range: inRange ? (mode === "attack" ? "attack" : isHealArt ? "heal" : "art") : null,
      aura: !isLegal && !inRange && !inPath && !isSelected ? (auraByKey.get(key) ?? null) : null
    }));
  }

  // Weather goes in its own layer when the host page provides one. #boardLayer is
  // filtered (feTurbulence stone grain), and a perpetually-animating descendant
  // forces that whole filter to re-rasterize every frame — measured at ~14fps
  // nested versus ~60fps as a sibling, which is the bulk of "weather is laggy".
  // Resolved from the board root rather than passed in, so adding the layer to a
  // host page is enough to opt it in; hosts without one fall back in place.
  const weatherHost = weatherLayer ?? board.querySelector?.("#weatherLayer") ?? boardLayer;
  updateWeatherLayer(weatherHost, boardLayer, metrics, state.size, activeWeather);

  unitsLayer.querySelectorAll(".volley-hit").forEach((element) => element.classList.remove("volley-hit"));
  if (volleyCones) boardCache.hoverCleanups.push(...wireVolleyHover(volleyCones, tileByKey, unitsLayer, state, onAreaHover));
  if (blastArt) boardCache.hoverCleanups.push(...wireTargetedBlastHover(actor, blastArt, tileByKey, unitsLayer, state, legal, onAreaHover));

  // Units and tile props (Build Cover walls, Throw Cigar fire) share ONE depth-
  // sorted layer so isometric occlusion is correct: a prop closer to the viewer
  // (larger x+y) paints over a unit behind it, and a unit in front paints over a
  // prop behind it. Painting walls/fire inside the board layer (as before) put
  // every unit on top of every wall regardless of depth — the layering bug. Ties
  // on the same anti-diagonal can't visually overlap; only a unit standing in
  // fire shares a tile, and `z` keeps that unit above its own fire.
  const renderables = [];
  for (const u of state.units) {
    if (u.hp <= 0 || u.introHidden) continue;
    const isTarget = actor && legal.has(positionKey(u.position)) && (
      ((targeted || Boolean(nukeArt)) && u.player !== actor.player) ||
      // Age / Time Stretch reticle every in-range unit they can target (ally or enemy).
      (isAllyOrEnemyArt && u.id !== actor.id) ||
      // Anoint reticles an in-range ally (never self).
      (isAllyArt && u.id !== actor.id && u.player === actor.player) ||
      // Line abilities reticle their first-contact target (ally or enemy).
      (isLineArt && u.id !== actor.id) ||
      // Pyroclasm reticles every enemy caught on its rays.
      (isPyroclasm && u.player !== actor.player)
    );
    renderables.push({
      key: `unit:${u.id}`,
      depth: u.position.x + u.position.y,
      z: 1,
      signature: JSON.stringify({
        size: state.size,
        unit: u,
        stats: getEffectiveStats(u, state),
        team: colorOf(state, u.player),
        selected: u.id === selectedId,
        isTarget: Boolean(isTarget),
        hoverable: Boolean(onUnitHover)
      }),
      make: (cache) => createUnitFigure(metrics, u, {
        isTarget,
        selectedId,
        onUnitClick: (position) => cache.onTileClick?.(position),
        onUnitHover: onUnitHover
          ? (hovered) => cache.onUnitHover?.(hovered ? cache.unitsById.get(u.id) : null)
          : null,
        state
      })
    });
  }
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "wall" && obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const position = { x, y };
    const point = gridToScreen(metrics, x, y);
    renderables.push({
      key: `object:${key}`,
      depth: x + y,
      z: 0,
      signature: `${state.size}:${key}:${obj.kind}`,
      make: (cache) => {
        const fig = obj.kind === "wall" ? createWallFigure(metrics, point) : createFireFigure(metrics, point);
        if (obj.kind !== "wall") fig.addEventListener("click", () => cache.onTileClick?.(position));
        return fig;
      }
    });
  }
  renderables.sort((a, b) => a.depth - b.depth || a.z - b.z);
  reconcileUnitLayer(unitsLayer, {
    size: state.size,
    renderables,
    onTileClick,
    onUnitHover,
    units: state.units
  });
}
