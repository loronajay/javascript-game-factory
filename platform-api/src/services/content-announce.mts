// Publishing platform content tells the whole player base about it.
//
// Bulletins and events are the only two writes in the platform that address every account
// at once, so they share one implementation and one set of rules:
//
//   1. Only PUBLICLY VISIBLE content announces. What that means differs per kind — see
//      the two configs below — but the principle does not: this fan-out has no audience
//      filter, so anything it can send must already be readable by everyone.
//   2. Content announces at most once in its lifetime. The claim lives in SQL, not here,
//      so a retry or a concurrent publish cannot slip a second blast through.
//   3. A failure here never fails the operator's save. The bulletin or event is the thing
//      they asked for; the notification is a side effect, and losing it must not turn a
//      successful publish into an error they have to guess at.

export interface AnnounceResult {
  announced: boolean;
  reason?: string;
  recipientCount?: number;
}

interface AnnounceKind {
  /** notifications.type the browser switches on. */
  notificationType: string;
  /** Prefix for the deterministic per-recipient row id. Must be unique per kind. */
  idPrefix: string;
  /** Is this record in a state the whole platform can already see? */
  isPublic: (record: any) => boolean;
  /** Kind-specific payload fields, on top of the shared id/slug/title/preview. */
  extraPayload?: (record: any) => Record<string, unknown>;
}

// A bulletin is a noticeboard notice: published + public is the one visible state, and
// `draft` is the operator's staging area.
const BULLETIN_KIND: AnnounceKind = {
  notificationType: "bulletin_posted",
  idPrefix: "notif-bulletin-",
  isPublic: (bulletin) => bulletin?.status === "published" && bulletin?.audience === "public",
};

// An event has no draft state — the calendar hides `cancelled` and shows everything else,
// so a `scheduled` event is public the instant it is created. `completed` is deliberately
// excluded: a past event is still on the calendar, but announcing one would be telling
// everyone about something they can no longer attend. That leaves the two forward-looking
// states, which is also what makes `cancelled` usable as a staging state — it never spends
// the claim, so an operator can create quietly and announce by flipping to `scheduled`.
const EVENT_KIND: AnnounceKind = {
  notificationType: "event_posted",
  idPrefix: "notif-event-",
  isPublic: (event) => event?.status === "scheduled" || event?.status === "live",
  extraPayload: (event) => (event?.startsAt ? { startsAt: String(event.startsAt) } : {}),
};

async function announceContent(kind: AnnounceKind, {
  record,
  actorPlayerId = "",
  claimAnnouncement,
  broadcast,
}: any = {}): Promise<AnnounceResult> {
  if (!record?.id) return { announced: false, reason: "invalid_record" };
  if (!kind.isPublic(record)) return { announced: false, reason: "not_public" };
  if (typeof claimAnnouncement !== "function" || typeof broadcast !== "function") {
    return { announced: false, reason: "not_configured" };
  }

  try {
    const claimed = await claimAnnouncement(record.id);
    if (!claimed) return { announced: false, reason: "already_announced" };

    // The summary is what the notification list shows under the headline; the body is the
    // full text and belongs on the board or the event page, not in a dropdown row.
    const preview = String(record.summary || "").slice(0, 200);
    const recipientCount = await broadcast({
      idPrefix: `${kind.idPrefix}${record.id}-`,
      actorPlayerId,
      type: kind.notificationType,
      payload: {
        contentId: String(record.id),
        slug: String(record.slug || ""),
        title: String(record.title || ""),
        ...(preview ? { preview } : {}),
        ...(kind.extraPayload ? kind.extraPayload(record) : {}),
      },
    });

    return { announced: true, recipientCount: Number(recipientCount) || 0 };
  } catch (err) {
    process.stderr.write(`[announce] ${kind.notificationType} error: ${(err as any)?.message || err}\n`);
    return { announced: false, reason: "server_error" };
  }
}

export async function announceBulletinService({ bulletin, ...rest }: any = {}): Promise<AnnounceResult> {
  return announceContent(BULLETIN_KIND, { record: bulletin, ...rest });
}

export async function announceEventService({ event, ...rest }: any = {}): Promise<AnnounceResult> {
  return announceContent(EVENT_KIND, { record: event, ...rest });
}
