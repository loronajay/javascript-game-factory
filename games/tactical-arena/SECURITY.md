# Tactical Arena — Economy Security Model

Last reviewed: **2026-08-13**, ahead of the production application. The review covered the shared
platform API, account/profile mutations, ranked writes, Tactical Arena progression and
economy claims, Stripe/Google Play fulfillment, mobile packaging, dependency advisories, and
tracked-secret patterns.

That pass changed three things: the Play fulfillment path stopped trusting a client-supplied
`orderId` (see invariant 11 — it was a live duplicate-grant path for consumables), account
deletion was extended to actually delete the per-game economy rows, and the ownership-grandfather
window was **closed** now that every legitimate account has migrated.

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

### Real-money (premium) purchases — two rails, one trust model
**Web: Stripe.** Server-side price catalog, Stripe Checkout, webhook signature verified with
`timingSafeEqual`, fulfillment idempotent by checkout session id. See `STRIPE_CHECKOUT_SETUP.md`.

**Android: Google Play Billing.** The client posts a Play *product id* and an opaque purchase
token to `POST /payments/tactical-arena/play-purchases`; `platform-api/src/services/play-billing.mts`
re-resolves that product against the server's own catalog, verifies the token with Google's
`androidpublisher` API (requiring `purchaseState === 0`), and grants through the same
`recordGameProgressClaim` path Stripe uses. Both rails share
`resolveTacticalArenaPremiumOffer`, so a purchase is priced identically wherever it happens.
Google verification failing — outage, unknown token, cancelled or pending state — grants
nothing. See `mobile/tactical-arena/HANDOFF.md` §3.

Either way, the public game-progress `/claims` route **rejects** `premium-*` claim kinds
(`403 claim_kind_forbidden`); premium entitlements can only be granted by a server-side
fulfillment path.

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

### Consumables: the spend and the roll are one server transaction
Consumables are the only shop kind that is *not* an entitlement — they stack, they are spent,
and some of them grant something else when spent. That makes them a distinct attack surface,
so both halves live on the server:

- **Buying** goes through the same Stripe path as everything else. `resolveTacticalArenaPremiumOffer`
  prices a `kind: "consumable"` offer from `services/consumable-catalog.mts`, and fulfillment
  records a `premium-consumable-purchase` claim that adds *quantity* to `game_inventory_items`
  rather than granting an entitlement. That claim kind is in `PREMIUM_CLAIM_KINDS`, so the public
  `/claims` route refuses it exactly like the other paid kinds. A claim payload can only name
  items that exist in the server catalog, and per-purchase quantity is capped.
- **Using** goes through `POST /game-progress/:slug/consumables/activate` →
  `activateInventoryItem`. The decrement and any grant happen in **one** transaction, so a crash
  can never leave a spent item with no reward or a reward with no spend. For a random-skin
  consumable the server does the roll (`selectRandomUnownedSkins`, `node:crypto` draw without
  replacement over the unowned skins of that rarity) and grants the entitlement with
  `source='consumable'`. The client only names the item — it can never name the skin it wants,
  and because ownership self-heals from the server on boot, a client-side grant would not
  survive anyway. If the rarity pool is exhausted the activation is refused (`no_unowned_skins`)
  with the item left intact.
- **Idempotency**: the caller supplies an `activationId`; a retried request replays the stored
  result instead of spending a second item. A lost response therefore never costs the player an
  item.
- **Refunds** claw back quantity (`greatest(0, quantity - n)`) through the same
  `findStripeGrant` → revoke path as entitlements. Quantity already spent is gone; the unspent
  remainder is removed.

Local `src/progression/inventory.js` stays a write-through cache: `mergeServerInventory` takes
the server counts as truth under the same `authoritative` rule as ownership. The local timed
record drives the UI, but campaign Valor pricing reads the matching server activation claims,
starts pending boosts at the first payout, and calculates the bonus from the server catalog.

### Valor is server-authoritative
- **Earn** is recorded via the pending-claim queue (`gameProgressClient.js`) — campaign/tutorial
  grants sync up as claims. Public claims are checked against
  `tactical-arena-reward-catalog.mts`: canonical claim id, real mission/tutorial, exact allowed
  reward, and prerequisite completion rows. Valor amounts are calculated server-side; an
  oversized client amount is ignored. Paid Valor boosts are calculated from server activation
  records. (Campaign-mission *completion* itself is still client-asserted; see Known limits.)
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

- **Backfill** (`POST /game-progress/:slug/backfill`) — **CLOSED as of 2026-08-13. It grants
  nothing.** It existed for exactly one migration: importing each player's locally-stored units,
  skins and Valor once, so the switch to server authority lost no purchases. That made it the
  only place a client could ever assert ownership it had not paid for. It was fenced hard (a
  one-shot `migration:local-ownership-v1` claim row, a catalog whitelist, a 2000-item cap, an
  account-age cutoff), and the last opening — a pre-2026-07-28 account with an empty server set
  could re-run its consumed migration once — was still a live injection path for anyone holding
  an old, empty account. Every legitimate account has now migrated, so the whole path is retired:
  no entitlement and no Valor can be created here for any account, of any age, in any server
  state. The history (the empty-payload and stranded-account guards, added 2026-07-27 after the
  one-shot stranded a real account) is in the changelog; none of it is live code any more.
- **The route deliberately still exists and still answers ok.** The client only switches to
  server authority — the reconcile that filters injected local ownership back out — once this
  call has confirmed (`OWNERSHIP_BACKFILL_FLAG` in `bootProgressSync.js`). Deleting the route, or
  making it fail, would pin every client in additive mode forever, so injected ownership would
  never be reconciled away. Answering "already migrated" is what closes that loop. The client's
  own stranded-account repair block in `bootProgressSync.js` is now vestigial: it still posts on
  a boot where the server owns nothing, and the server no-ops it.
- **Authoritative reconcile** (`{ authoritative: true }`) replaces the server-entitlement fields
  with the server's exact set, empties the pure-ownership fields, and filters the flow-bearing
  reward-pick fields down to picks the server actually has. Because `normalizeUnlockProgress`
  runs on write, the owned set re-derives to exactly **server + starters**. Legit synced picks
  survive (and still gate re-picking); injected ownership is dropped and **self-heals on every
  online boot**. Ownership reads (`isProgressUnitUnlocked`/`isProgressSkinUnlocked`) therefore
  reflect server truth without every call site becoming async.

### Play progress syncs, but is NOT authoritative
Campaign clears/stars and tutorial completion travel through the same claim queue
(`playProgressSync.js`): a `campaign-progress` claim per mission (keyed on the star count, so a
better replay is a new claim and the server keeps `greatest`), and the existing
`tutorial-complete` claims. `getGameProgress` returns both back, and the merges are
**forward-only unions** — neither side can lower the other. A one-time per-device backfill
(`PLAY_PROGRESS_BACKFILL_FLAG`) queues whatever the device already had, including reward *picks*
(campaign packs, the tutorial reward skin), which have no other record and were otherwise lost
when signing in on a second device.

This is progress restoration, not an authority claim: campaign completion stays client-asserted
(see Known limits), and the play-progress merge deliberately carries **no Valor** — the payout
already happened locally and the balance is reconciled separately, so re-claiming it would pay
twice. Because it is a union, a campaign reset that failed to reach the server (offline) will be
restored from the server on the next online boot; `resetCampaignOnServer` is what prevents that
and is called on the in-game reset.

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
7. A consumable's reward is decided server-side, in the same transaction that spends it. Never
   roll a random grant on the client, and never let the client name what it won. Activation
   stays idempotent on its `activationId`.
8. `marketplace.js` `CONSUMABLE_OFFERS` must match `services/consumable-catalog.mts` offer for
   offer (id, sku, price, effect) — guarded by a cross-import test in `tests/marketplace.test.js`.
9. A profile badge is proof of a purchase or a record, so **equipping one is validated
   server-side** against the player's earned set (`playerHasGameBadge`), not merely sanitized.
   A refused equip keeps the previous pick. Derived badges stay computed from
   `game_entitlements` and are never written to `game_player_badges` — that is what keeps
   them un-injectable. Auto-awarded badges qualify only on facts the player cannot write
   directly (a resolved-match `game_ratings` row, a completed campaign row).
9a. A purchasable icon avatar (`avatar-NNN`, `rankedAvatars.js`) is validated the same way:
   `resolveAvatarUnit` (`ranked-profile.mts`) checks `game_entitlements` for `avatar:<id>`
   before storing an equip, refusing an unowned pick like an unearned badge. The first
   `RANKED_AVATAR_FREE_COUNT` ids are a free starter set and always pass. A legacy unit/skin
   portrait avatar id is **not** an `avatar-NNN` id, so it stays sanitized-only (opaque,
   client-gated) — picking a portrait you don't own has no separate economic value beyond
   owning the unit/skin, unlike a purchased icon avatar.
9b. The flat Valor price for a locked icon avatar (`RANKED_AVATAR_VALOR_COST` = 200) is
   duplicated in `platform-api/src/services/ranked-avatar-catalog.mts` and
   `games/tactical-arena/src/ui/rankedAvatars.js` — keep both in lockstep the same way unit/
   skin Valor pricing is, so the displayed price always matches the charged price.
10. `skin-pack:<packId>` entitlements are granted alongside a pack's skins purely as a durable
   record that the bundle was bought. They own no content — never treat one as granting the
   skins, and never let the client assert one.
11. A Play purchase is keyed on **Google's** `orderId`, never the client's, and its token hash
   is bound to the first account that redeemed it. Play tokens are bearer values: without that
   binding, one token replayed under a second account opens a second claim row and grants
   twice. Store the hash, never the raw token — and keep persisting `playPurchaseTokenHash`,
   since it is the only join key from a voided purchase back to what was granted.
   **This shipped violated for a while** (fixed 2026-08-13): fulfillment read
   `purchase.orderId || body.orderId`, so when Google's `purchases.products` response carried
   no order id the *client's* value named the claim. The claim id is the only thing making a
   replay idempotent, so one verified token resubmitted with fresh order ids minted a claim row
   each time — and for a **consumable** that adds quantity every time, because consumables stack
   and `resolveTacticalArenaPremiumOffer` has no already-owned short-circuit for them.
   Entitlement replays were harmless (same row). The client no longer sends `orderId` at all,
   and the deterministic `play-purchase:token:<hash>` fallback covers the no-order-id case.
   Regression: the "client order id is ignored even when Google supplies none" and consumable
   replay tests in `platform-api/tests/play-billing.test.mjs` — the two pre-existing order-id
   tests both passed against the bug, because one had Google's id winning and the other sent
   none.
12. A Play purchase must be refused **before Google's sheet opens** when the player already owns
   everything it would grant (`createOwnedOfferGuard` → `isOfferFullyOwned`). Play takes the
   money before the server is consulted, so a post-hoc refusal can only be repaired by a
   refund — the preflight is the only place a duplicate can be stopped for free. It mirrors
   `resolveTacticalArenaPremiumOffer` (partial skin packs stay buyable) and a cross-import test
   holds the two in step. It fails **open**: a fetch failure must not block a legitimate sale,
   and the backstop below still applies.
13. A Play purchase that grants nothing must only return `ok` when **that token is already on
   one of our claim rows**. That is what separates a boot-recovery retry (grant landed,
   acknowledge failed — must settle) from a genuine duplicate purchase of an already-owned
   item (must NOT settle, so Google auto-refunds it within three days). Returning `ok` for
   both keeps the player's money for nothing; returning an error for both gets legitimate
   purchases refunded. The client settles only on `ok`, which is what makes this work.
14. Premium USD prices are derived from a unit's **star tier**, so a balance change moves real
   money. `tests/marketplace.test.js` cross-checks every premium unit and skin price against
   the server's `payments.mts` catalog — when it fails after a balance pass, fix the server
   catalog and re-run `npm run play:sync` so the Play Console price follows.
15. Tactical Arena rating changes use only the brokered ranked-match flow. The legacy generic
   `POST /ratings/tactical-arena` endpoint is refused with `server_attestation_required`, so a
   client cannot invent a session/outcome against the same ladder.
16. Profile, metrics, friendship, and relationship mutations require a verified account. A
   path player id must match the account, and pair mutations require the account to be one of
   the two participants. Profile views use a dedicated atomic increment endpoint; clients do
   not submit counter totals.

### Account deletion removes the economy too

Google Play requires an in-app account-deletion path for any app offering in-app account
creation, which Tactical Arena's auth panel does. The in-game Account menu now carries a
confirm-gated **Delete Account** (`src/ui/accountMenu.js`), and the server-side delete
(`platform-api/src/db/auth.mts`) removes the per-game rows as well as the profile.

That matters here because only `players`, `accounts`, `player_profiles`, `player_metrics`,
`player_relationships` and `player_photos` were ever wired with `on delete cascade`. Every
game table — entitlements, Valor, claims, inventory, campaign progress, ranked profile/ELO/unit
stats, TA friendships and badges — joins on a plain text player id, so deletion had been leaving
a "deleted" account still owning everything it had bought. `PLAYER_SCOPED_DELETES` is the
explicit list, and `platform-api/tests/account-deletion.test.mjs` reads the migrations and fails
when a new player-scoped table appears that neither cascades nor is handled. `admin_audit_log`
and `content_reports` are deliberately retained (audit and moderation integrity).

## Known limits (accepted / future)

- **Session-scoped injection**: an injected item is visible until the next online boot, then
  wiped. Durable ownership is server-only.
- **Local Valor display** can be inflated by a cheater with injected campaign progress (the
  local `repairUnlockProgressFromCampaignProgress` path), but it grants no purchasing power —
  the server `/spend` gates it. Cosmetic only.
- **Multi-device old Valor purchases**: pre-migration Valor purchases made separately on
  multiple devices and never synced may not all have carried over, since the one-time backfill
  was per account and the window is now closed. Historical only — premium, new-Valor, and
  campaign/tutorial items are unaffected, and nothing new can land in this state.
- **Campaign completion** is still client-asserted (single-player). A future pass could
  server-validate mission outcomes via deterministic replay of the headless core. Note this
  also reaches the OG Commander badge, whose campaign path trusts the same claimed progress;
  its ranked path (a resolved-match `game_ratings` row) does not.
- **In-match nameplate cosmetics** — the equipped badge and avatar, like the tagline, travel in
  the peer's identity payload, so a modified client could show its opponent a badge or a
  locked icon avatar it never earned/bought *on that opponent's screen only*. It is cosmetic,
  never hashed, and every authoritative surface (profile, card, ladder) reads the server's own
  copy instead, which would refuse to have stored an unowned pick in the first place.
- **Rare multi-source revocation edge**: an entitlement's `source` is set by whichever grant
  landed *first* and is never overwritten. So if a Stripe purchase granted an item first and the
  player *later* also earned that same item another way, a chargeback still revokes the (single)
  row. Conversely, if the other source landed first, a chargeback won't revoke it. Premium skins
  aren't campaign/Valor grantable in practice, so this is a corner case, not a live path.
- **Partial refunds** are not auto-handled — they're logged and left for manual review. Repeat
  chargeback offenders are logged (audit claim rows) but not yet blocked from future purchases.
- **Web CSP is a deployment task.** The static web host does not currently send an enforcing
  `Content-Security-Policy`. Add and stage a report-only policy at the host/CDN before enforcing
  it; include the Stripe script/frame/connect origins and the platform API. Do not drop an
  untested meta policy into the closed-test build because it can block checkout or game assets.

## Platform-level hardening (backend)

Not game-specific but part of the same effort, in `platform-api/`: JWT pinned to HS256 + DB
session revocation; CORS restricted to an allow-list (`https://factory.jayarcade.com`, the legacy
`https://loronajay.github.io` Pages origin, and localhost,
extendable via `ALLOWED_ORIGINS`); `/activity` requires auth and stamps the server-verified
actor; per-IP rate limiting on auth + checkout-session creation; upload content validated by
magic bytes (not the client-declared MIME), which also guards the Cloudinary `raw` audio store.
The Android manifest disables app-data backup and cleartext traffic; the release preflight
enforces those flags plus Capacitor HTTPS/mixed-content settings. Stripe Checkout uses the
current Dahlia API version, omits fixed payment-method lists, includes a tracked integration
identifier, and prefers a restricted key (`STRIPE_RESTRICTED_KEY`) when configured.
