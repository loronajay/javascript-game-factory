# Tactical Arena — Economy Security Model

Tactical Arena sells digital goods for real money (Stripe) and soft currency (Valor). This
doc records how ownership and currency are protected so future changes don't quietly regress
it. The threat is a player editing `localStorage` (or replaying requests) to grant themselves
units, skins, or Valor they didn't buy or earn.

## Core principle

**For a signed-in account, the platform server is the source of truth for spendable Valor and
owned entitlements. `localStorage` is a cache and a guest/offline store — never trusted for a
signed-in player.** `localStorage` is fully tamper-able (the integrity seal only detects, and
is bypassable by also clearing the seal key), so nothing durable can depend on it.

Guests / offline play stay local-first by design; the protections below apply to signed-in
accounts, where money and durable value live.

## How it holds together

### Real-money (premium) purchases — Stripe only
Server-side price catalog, Stripe Checkout, webhook signature verified with `timingSafeEqual`,
fulfillment idempotent by checkout session id. The public game-progress `/claims` route
**rejects** `premium-*` claim kinds (`403 claim_kind_forbidden`); premium entitlements can only
be granted by the server's Stripe fulfillment path. See `STRIPE_CHECKOUT_SETUP.md`.

### Refunds and chargebacks revoke entitlements
A refund or chargeback pulls the granted item back. The webhook (`fulfillStripeWebhook` in
`platform-api/src/services/payments.mts`) handles:
- `charge.dispute.created` (chargeback opened) → **revoke immediately**. Digital-goods policy:
  the funds are already withheld and most disputes are lost. If the dispute is later resolved
  in our favor, `charge.dispute.closed` with `status: won` **re-grants** the item; any other
  close status keeps it revoked (idempotent).
- `charge.refunded` → revoke, but **only on a full refund** (`refunded === true` or
  `amount_refunded >= amount`). Partial refunds are logged and ignored.

**The linkage:** refund/dispute events carry a `payment_intent`/`charge`, never the checkout
session metadata (playerId, sku, entitlements). So the grant claim now persists
`paymentIntentId` in its payload, and `findStripeGrant` traces a payment back to what was
granted. For purchases fulfilled before that key existed, the webhook falls back to a Stripe
`GET /checkout/sessions?payment_intent=…` lookup.

**Scoping (don't loosen this):** `revokeGameEntitlements` deletes only `game_entitlements` rows
that are still `source='stripe'` AND carry this exact purchase's `source_id` (the checkout
session id). An item the player also owns through a different path (campaign, tutorial, Valor)
is never yanked. Revocation and re-grant are each idempotent via an audit claim
(`stripe-revocation:<id>` / `stripe-regrant:<id>`), so duplicate webhook deliveries are safe.
Because ownership is server-authoritative and self-heals on boot, deleting the server row is
enough — the item disappears on the player's next online boot with no client change.

Enable these events on the Stripe webhook endpoint (Dashboard → Developers → Webhooks):
`charge.dispute.created`, `charge.dispute.closed`, `charge.refunded`. See
`STRIPE_CHECKOUT_SETUP.md`.

### Valor is server-authoritative
- **Earn** is recorded via the pending-claim queue (`gameProgressClient.js`) — campaign/tutorial
  grants sync up as claims. (Campaign-mission *completion* itself is still client-asserted; see
  Known limits.)
- **Spend** goes through the server `POST /game-progress/:slug/spend`. The server prices the
  offer from its own Valor catalog (must stay in lockstep with `marketplace.js`) and does the
  balance-check + deduct + entitlement grant in one atomic transaction (`FOR UPDATE` row lock +
  `valor_balance >= cost` conditional update + a DB `check (valor_balance >= 0)` constraint).
  The client never sends a price and never decrements Valor locally. `shopValorPurchase.js`
  drives this and applies the returned progress as truth.
- **Balance** is reconciled to the server's on boot (see below). A tampered local balance can
  make the shop's local pre-check pass, but the server `/spend` is the authority and rejects it,
  so inflated local Valor grants no purchasing power.

### Ownership is reconciled to the server on boot
`bootProgressSync.js` order: fulfill any returned checkout → flush pending claims → **one-time
ownership backfill** → apply the server snapshot via `mergeServerEntitlementsIntoUnlockProgress`.

- **Backfill** (`POST /game-progress/:slug/backfill`) grandfathers the player's *existing* local
  owned set into the server once per account (gated by a `migration:local-ownership-v1` claim
  row; entitlement ids are format-validated and capped). This is why the switch to
  server-authority loses no progress. It is one-time — injected local ownership can be
  grandfathered at most once, never re-injected later.
- **Authoritative reconcile** (`{ authoritative: true }`) replaces the server-entitlement fields
  with the server's exact set, empties the pure-ownership fields, and filters the flow-bearing
  reward-pick fields down to picks the server actually has. Because `normalizeUnlockProgress`
  runs on write, the owned set re-derives to exactly **server + starters**. Legit synced picks
  survive (and still gate re-picking); injected ownership is dropped and **self-heals on every
  online boot**. Ownership reads (`isProgressUnitUnlocked`/`isProgressSkinUnlocked`) therefore
  reflect server truth without every call site becoming async.

### The critical safety gate
Authoritative mode runs **only when** signed-in AND the claim flush succeeded AND the backfill
has confirmed (`OWNERSHIP_BACKFILL_FLAG` present). If the backfill hasn't succeeded, the merge
stays additive. **Do not remove the `backfillConfirmed` condition** — without it, a transient
backfill failure would filter a legit player's items against an incomplete server set and delete
them permanently.

## Invariants — don't break these

1. Valor spend and premium fulfillment happen server-side; the client never asserts a price or a
   premium entitlement.
2. The authoritative reconcile only runs after a confirmed backfill (`backfillConfirmed`).
3. The shop's own purchase path uses `authoritativeValor` (additive + Valor truth), not full
   `authoritative` (which filters) — only the boot snapshot is complete enough to filter against.
4. `marketplace.js` Valor prices must match the server `valor-catalog` (displayed price ==
   charged price).
5. Guests / offline keep the additive (non-authoritative) merge — never force authority without
   a live, flushed, backfilled sign-in.
6. Revocation deletes only `source='stripe'` rows matching the refunded/disputed purchase's
   `source_id`; it never touches entitlements owned through another path. Revoke/re-grant stay
   idempotent via their audit claim rows. The grant claim must keep persisting `paymentIntentId`
   — it is the only join key from a refund/dispute back to what was granted.

## Known limits (accepted / future)

- **Session-scoped injection**: an injected item is visible until the next online boot, then
  wiped. Durable ownership is server-only.
- **Local Valor display** can be inflated by a cheater with injected campaign progress (the
  local `repairUnlockProgressFromCampaignProgress` path), but it grants no purchasing power —
  the server `/spend` gates it. Cosmetic only.
- **Multi-device old Valor purchases**: pre-migration Valor purchases made separately on
  multiple devices and never synced may not all carry over if devices migrate at different
  times (one-time backfill is per account). Premium, new-Valor, and campaign/tutorial items are
  unaffected.
- **Campaign completion** is still client-asserted (single-player). A future pass could
  server-validate mission outcomes via deterministic replay of the headless core.
- **Rare multi-source revocation edge**: an entitlement's `source` is set by whichever grant
  landed *first* and is never overwritten. So if a Stripe purchase granted an item first and the
  player *later* also earned that same item another way, a chargeback still revokes the (single)
  row. Conversely, if the other source landed first, a chargeback won't revoke it. Premium skins
  aren't campaign/Valor grantable in practice, so this is a corner case, not a live path.
- **Partial refunds** are not auto-handled — they're logged and left for manual review. Repeat
  chargeback offenders are logged (audit claim rows) but not yet blocked from future purchases.

## Platform-level hardening (backend)

Not game-specific but part of the same effort, in `platform-api/`: JWT pinned to HS256 + DB
session revocation; CORS restricted to an allow-list (`https://loronajay.github.io` + localhost,
extendable via `ALLOWED_ORIGINS`); `/activity` requires auth and stamps the server-verified
actor; per-IP rate limiting on auth + checkout-session creation; upload content validated by
magic bytes (not the client-declared MIME), which also guards the Cloudinary `raw` audio store.
