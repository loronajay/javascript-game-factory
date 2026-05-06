const ROTATE = { EW: "NS", NS: "EW", NE: "ES", ES: "SW", SW: "NW", NW: "NE" };

function wrongMask(expected) {
  const sameType = expected === "EW" || expected === "NS"
    ? ["EW", "NS"]
    : ["NE", "ES", "SW", "NW"];
  return sameType.find((mask) => mask !== expected) || "EW";
}

export class GameState {
  constructor(boardData) {
    this.boardData = boardData;
    this.onChange = null;
    this.reset();
  }

  reset() {
    this.scores = { blue: 0, red: 0 };
    this.routes = {};
    this.slots = {};
    this.terminals = {};

    for (const route of this.boardData.routes) {
      this.routes[route.routeId] = {
        completed: false,
        terminalType: route.terminalType,
        owner: route.owner
      };
      this.terminals[route.terminalId] = {
        completed: false,
        terminalType: route.terminalType,
        owner: route.owner
      };
    }

    for (const slot of this.boardData.repairSlots) {
      this.slots[slot.slotId] = {
        placedMask: slot.slotType === "hole" ? null : wrongMask(slot.expectedMask),
        locked: false
      };
    }

    this.emit();
  }

  getSlot(slotId) {
    return this.slots[slotId];
  }

  getSlotData(slotId) {
    return this.boardData.repairSlots.find((slot) => slot.slotId === slotId);
  }

  place(slotId, mask) {
    const slot = this.getSlot(slotId);
    const slotData = this.getSlotData(slotId);

    if (!slot || !slotData || slot.locked) {
      return { ok: false, message: "Slot is locked or invalid." };
    }

    slot.placedMask = mask;
    const correct = mask === slotData.expectedMask;
    const resolved = this.checkRoute(slotData.routeId);

    this.emit();

    return {
      ok: true,
      message: `${slotData.owner.toUpperCase()} placed ${mask} in ${slotId}${correct ? " ✓" : ""}`,
      resolved
    };
  }

  rotate(slotId) {
    const slot = this.getSlot(slotId);
    const slotData = this.getSlotData(slotId);

    if (!slot || !slotData || slot.locked || !slot.placedMask) {
      return { ok: false, message: "Cannot rotate empty, locked, or invalid slot." };
    }

    slot.placedMask = ROTATE[slot.placedMask] || "EW";
    const correct = slot.placedMask === slotData.expectedMask;
    const resolved = this.checkRoute(slotData.routeId);

    this.emit();

    return {
      ok: true,
      message: `${slotData.owner.toUpperCase()} rotated ${slotId} to ${slot.placedMask}${correct ? " ✓" : ""}`,
      resolved
    };
  }

  checkRoute(routeId) {
    const routeState = this.routes[routeId];
    if (!routeState || routeState.completed) return null;

    const routeSlots = this.boardData.repairSlots.filter((slot) => slot.routeId === routeId);
    const complete = routeSlots.every((slot) => this.slots[slot.slotId].placedMask === slot.expectedMask);

    if (!complete) return null;

    return this.resolveRoute(routeId, routeSlots);
  }

  resolveRoute(routeId, routeSlots) {
    const route = this.boardData.routes.find((item) => item.routeId === routeId);
    const routeState = this.routes[routeId];

    routeState.completed = true;
    this.terminals[route.terminalId].completed = true;

    for (const slot of routeSlots) {
      this.slots[slot.slotId].locked = true;
    }

    if (route.terminalType === "damage") {
      this.scores[route.owner] += 1;
      return {
        type: "damage",
        message: `⚡ ${route.owner.toUpperCase()} completed DAMAGE route ${route.routeId} → ${route.terminalId}. Score ${this.scores[route.owner]}/5.`
      };
    }

    return {
      type: "dud",
      message: `✖ ${route.owner.toUpperCase()} completed DUD route ${route.routeId} → ${route.terminalId}. Route locked.`
    };
  }

  emit() {
    if (typeof this.onChange === "function") this.onChange();
  }
}
