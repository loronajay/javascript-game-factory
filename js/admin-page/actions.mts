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
  // Set only by the file-input change path, and `rerender` lets a long-running action
  // paint an intermediate state (an upload spinner) before it finishes.
  file?: File | null;
  rerender?: () => void;
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
    state.pendingImageUrl = "";
    state.bulletinDraft = null;
    state.flash = null;
    return false;
  }

  if (action === "bulletin:edit") {
    state.editingBulletinId = value;
    // A pending upload belongs to whatever was being composed, not to the record being
    // opened next — carrying it across would silently attach one bulletin's flyer to
    // another.
    state.pendingImageUrl = "";
    state.bulletinDraft = null;
    state.flash = null;
    return false;
  }

  // Uploading happens the moment a file is chosen, not on save, so the operator sees the
  // flyer in the form and can tell they picked the right one before committing to it.
  if (action === "bulletin:upload-image") {
    const file = context.file;
    if (!file) return false;

    // Capture what's typed before anything re-renders, or picking a flyer would wipe the
    // title and body the operator just wrote.
    state.bulletinDraft = readForm(form);
    state.uploadingImage = true;
    state.flash = null;
    context.rerender?.();

    const result = await api.uploadImage(file);
    state.uploadingImage = false;

    if (!result.ok) {
      state.flash = { tone: "error", message: describeAdminError(result.error) };
      return false;
    }

    state.pendingImageUrl = result.data?.url || "";
    state.flash = { tone: "ok", message: "Image attached. Save the bulletin to keep it." };
    return false;
  }

  if (action === "bulletin:remove-image") {
    state.bulletinDraft = { ...readForm(form), imageUrl: "" };
    // Clears the attachment from the form only. The bulletin keeps its stored image until
    // the operator saves, so a mis-click is undone by navigating away rather than being
    // instantly destructive. The uploaded file itself stays in Cloudinary.
    state.pendingImageUrl = "";
    if (state.editingBulletinId) {
      const editing = state.bulletins.find((entry) => entry.id === state.editingBulletinId);
      if (editing) editing.imageUrl = "";
    }
    state.flash = { tone: "ok", message: "Image removed. Save the bulletin to apply it." };
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
    // The attachment and draft are now stored on the record, so both scratch copies have
    // done their job. Leaving either set would keep overriding the saved values.
    state.pendingImageUrl = "";
    state.bulletinDraft = null;
    return true;
  }

  if (action === "bulletin:delete") {
    if (!confirmFn("Delete this bulletin? This cannot be undone.")) return false;
    const result = await api.deleteBulletin(value);
    if (!setFlash(state, result, "Bulletin deleted.")) return false;
    state.editingBulletinId = "";
    state.pendingImageUrl = "";
    state.bulletinDraft = null;
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
    const values = readForm(form);
    const result = await api.saveCabinet(value, {
      ...values,
      categories: splitList(values.categories),
      dimensions: splitList(values.dimensions).map((entry) => entry.toLowerCase()),
      playModes: splitList(values.playModes).map((entry) => entry.toLowerCase()),
    });
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

  // ---- Calendar fulfillment ----

  if (action === "calendar-filter") {
    state.calendarFilter = value;
    state.flash = null;
    return true;
  }

  if (action === "calendar-search") {
    state.calendarSearch = String(readForm(form).calendarSearch || "");
    state.flash = null;
    return true;
  }

  if (action === "calendar-export") {
    const result = await api.fetchCalendarOrdersCsv(state.calendarFilter);
    if (!result.ok) {
      state.flash = { tone: "error", message: describeAdminError(result.error) };
      return false;
    }
    const blob = new Blob([result.data || ""], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `calendar-orders-${state.calendarFilter}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.flash = { tone: "ok", message: "Export downloaded." };
    return false;
  }

  if (action === "calendar-order-save") {
    const values = readForm(form);
    // Marking an order shipped is what tells the customer it is on its way, so it is worth
    // one confirmation -- an accidental click here reads as a dispatch that never happened.
    if (values.fulfillmentState === "shipped" && !values.trackingNumber
      && !confirmFn("Mark this order shipped without a tracking number?")) {
      return false;
    }
    const result = await api.updateCalendarOrder(value, {
      fulfillmentState: values.fulfillmentState,
      trackingNumber: values.trackingNumber,
      carrier: values.carrier,
    });
    return setFlash(state, result, "Order updated.");
  }

  return false;
}

export async function refreshCurrentTab(state: AdminState): Promise<void> {
  await loadTabData(state);
}
