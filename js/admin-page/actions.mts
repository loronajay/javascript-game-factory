import { describeAdminError } from "../platform/api/admin-api.mjs";
import type { AdminState } from "./admin-state.mjs";
import { api, loadTabData } from "./admin-state.mjs";

// Every write the console can make, dispatched by the `data-action` on the control that
// was clicked. Renderers produce markup; this module is the only place that calls the API
// with a method other than GET.
//
// The uniform shape of each handler is: perform, then report. On success the state slice
// for the current tab is reloaded so the UI reflects what the server actually stored
// rather than what the form hoped it would — a slug the server rewrote, a publish date it
// stamped, an override it normalized.

export interface ActionContext {
  state: AdminState;
  form: HTMLFormElement | null;
  value: string;
  confirmFn: (message: string) => boolean;
}

// Collects a form into a plain object. Checkboxes become booleans; everything else is the
// trimmed string value. Number inputs stay strings — the API normalizes them, and parsing
// here would turn an empty "inherit" field into 0.
export function readForm(form: HTMLFormElement | null): Record<string, any> {
  const values: Record<string, any> = {};
  if (!form) return values;

  for (const element of Array.from(form.elements)) {
    const input = element as HTMLInputElement;
    const name = input?.name;
    if (!name) continue;
    values[name] = input.type === "checkbox" ? input.checked : String(input.value ?? "").trim();
  }
  return values;
}

function splitList(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function setFlash(state: AdminState, result: any, successMessage: string): boolean {
  if (result?.ok) {
    state.flash = { tone: "ok", message: successMessage };
    return true;
  }
  state.flash = { tone: "error", message: describeAdminError(result?.error) };
  return false;
}

// Returns true when the caller should reload the current tab's data.
export async function runAdminAction(action: string, context: ActionContext): Promise<boolean> {
  const { state, form, value, confirmFn } = context;

  // ---- Bulletins ----

  if (action === "bulletin:new") {
    state.editingBulletinId = "";
    state.flash = null;
    return false;
  }

  if (action === "bulletin:edit") {
    state.editingBulletinId = value;
    state.flash = null;
    return false;
  }

  if (action === "bulletin:save") {
    const values = readForm(form);
    const result = state.editingBulletinId
      ? await api.updateBulletin(state.editingBulletinId, values)
      : await api.createBulletin(values);

    if (!setFlash(state, result, state.editingBulletinId ? "Bulletin saved." : "Bulletin created.")) return false;
    // Land on the record that was just created so the operator can keep editing it
    // instead of hunting for it in the list.
    state.editingBulletinId = result.data?.bulletin?.id || state.editingBulletinId;
    return true;
  }

  if (action === "bulletin:delete") {
    if (!confirmFn("Delete this bulletin? This cannot be undone.")) return false;
    const result = await api.deleteBulletin(value);
    if (!setFlash(state, result, "Bulletin deleted.")) return false;
    state.editingBulletinId = "";
    return true;
  }

  // ---- Events ----

  if (action === "event:new") {
    state.editingEventId = "";
    state.flash = null;
    return false;
  }

  if (action === "event:edit") {
    state.editingEventId = value;
    state.flash = null;
    return false;
  }

  if (action === "event:save") {
    const values = readForm(form);
    const payload = { ...values, relatedGames: splitList(values.relatedGames) };
    const result = state.editingEventId
      ? await api.updateEvent(state.editingEventId, payload)
      : await api.createEvent(payload);

    if (!setFlash(state, result, state.editingEventId ? "Event saved." : "Event created.")) return false;
    state.editingEventId = result.data?.event?.id || state.editingEventId;
    return true;
  }

  if (action === "event:delete") {
    if (!confirmFn("Delete this event? This cannot be undone.")) return false;
    const result = await api.deleteEvent(value);
    if (!setFlash(state, result, "Event deleted.")) return false;
    state.editingEventId = "";
    return true;
  }

  // ---- Cabinets ----

  if (action === "cabinet:save") {
    const result = await api.saveCabinet(value, readForm(form));
    return setFlash(state, result, "Cabinet presentation saved.");
  }

  if (action === "cabinet:reset") {
    if (!confirmFn("Reset this cabinet to its game.json settings?")) return false;
    const result = await api.resetCabinet(value);
    return setFlash(state, result, "Cabinet restored to its game.json settings.");
  }

  // ---- Moderation ----

  if (action === "report:filter") {
    state.reportFilter = readForm(form).status || "open";
    return true;
  }

  if (action === "report:resolve" || action === "report:dismiss") {
    const nextStatus = action === "report:dismiss" ? "dismissed" : "resolved";
    const result = await api.resolveReport(value, nextStatus);
    return setFlash(state, result, `Report ${nextStatus}.`);
  }

  if (action === "report:remove") {
    // Encoded as "type|id" because a report row needs to carry both, and a delimiter is
    // safer here than two attributes that could drift apart in a re-render.
    const [targetType, targetId] = String(value).split("|");
    if (!confirmFn("Permanently delete this content? This cannot be undone.")) return false;
    const result = await api.removeContent(targetType, targetId);
    return setFlash(state, result, "Content removed.");
  }

  if (action === "report:suspend") {
    if (!confirmFn("Suspend this account for 7 days?")) return false;
    const result = await api.suspendAccount(value, { days: 7, reason: "Suspended from the report queue" });
    return setFlash(state, result, "Account suspended for 7 days.");
  }

  // ---- Accounts ----

  if (action === "account:suspend") {
    const values = readForm(form);
    if (!values.playerId) {
      state.flash = { tone: "error", message: "Enter a player ID first." };
      return false;
    }
    if (!confirmFn(`Suspend ${values.playerId} for ${values.days || 7} days?`)) return false;
    const result = await api.suspendAccount(values.playerId, { days: values.days, reason: values.reason });
    return setFlash(state, result, "Account suspended.");
  }

  if (action === "account:unsuspend") {
    const result = await api.liftSuspension(value);
    return setFlash(state, result, "Suspension lifted.");
  }

  if (action === "admin:grant") {
    const values = readForm(form);
    if (!values.playerId) {
      state.flash = { tone: "error", message: "Enter a player ID first." };
      return false;
    }
    if (!confirmFn(`Grant full admin access to ${values.playerId}?`)) return false;
    const result = await api.grantAdmin(values.playerId);
    return setFlash(state, result, "Admin access granted.");
  }

  if (action === "admin:revoke") {
    if (!confirmFn("Revoke admin access for this account?")) return false;
    const result = await api.revokeAdmin(value);
    return setFlash(state, result, "Admin access revoked.");
  }

  return false;
}

export async function refreshCurrentTab(state: AdminState): Promise<void> {
  await loadTabData(state);
}
