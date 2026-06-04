export function createDebugSnapshot({ tick, units, map, commands, ai }) {
  return {
    tick,
    map: {
      width: map.width,
      height: map.height,
      tileSize: map.tileSize,
      destructibleCount: map.destructibles?.size ?? 0,
      resourceNodes: map.resourceNodes?.map((node) => ({ id: node.id, kind: node.kind, discovered: !!node.discovered, tileX: node.tileX, tileY: node.tileY })) ?? [],
    },
    units: units.units.map((unit) => ({
      id: unit.id,
      type: unit.type,
      team: unit.team,
      x: round(unit.x),
      y: round(unit.y),
      hp: round(unit.hp),
      maxHp: unit.maxHp,
      state: unit.state,
      selected: unit.selected,
      attackTarget: unit.attackTarget ? { ...unit.attackTarget } : null,
      attackMoveTarget: unit.attackMoveTarget ? { ...unit.attackMoveTarget } : null,
      discovered: !!unit.discovered,
      pathLength: unit.path.length,
      blockedFor: round(unit.movementState?.blockedFor ?? 0),
      pathGoal: unit.debug?.pathGoal ? { x: round(unit.debug.pathGoal.x), y: round(unit.debug.pathGoal.y) } : null,
      queueAnchor: unit.debug?.queueAnchor ? { x: round(unit.debug.queueAnchor.x), y: round(unit.debug.queueAnchor.y), blockerId: unit.debug.blockerId ?? null } : null,
      formationMode: unit.debug?.formationMode ?? null,
      formationSlot: unit.debug?.formationSlot ? { ...unit.debug.formationSlot } : null,
      groupRouteLength: unit.debug?.groupRoute?.length ?? 0,
      engagementSlot: unit.debug?.engagementSlot ? {
        x: round(unit.debug.engagementSlot.x),
        y: round(unit.debug.engagementSlot.y),
        index: unit.debug.engagementSlot.index,
        total: unit.debug.engagementSlot.total,
      } : null,
      lanePriority: unit.debug?.lanePriority ?? 0,
      chokeReservation: unit.debug?.chokeReservation ? { ...unit.debug.chokeReservation } : null,
      routeId: unit.routeId ?? null,
    })),
    selectedIds: [...units.selectedIds],
    routeReservations: units.reservations?.routeReservationSnapshot?.().map((r) => ({ ...r, expiresAt: round(r.expiresAt) })) ?? [],
    chokeCells: units.chokeMap?.debugCells?.(120) ?? [],
    ai: ai?.snapshot?.() ?? null,
    recentCommands: commands?.serializeRecentHistory?.(12) ?? [],
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
