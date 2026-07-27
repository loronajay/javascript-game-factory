# Tactical Arena — Android Port Handoff

Status as of 2026-07-26. Read this first if you are picking the port up cold.

The goal: ship Tactical Arena on Google Play (Android first, iOS later) **without
fork­ing the web game**. That constraint has been honoured — see
[What the web build gave up](#what-the-web-build-gave-up).

---

## 1. Where it stands

The app builds, installs, and plays on a device. **49.4 MB APK.**

| Area | State | How it was verified |
| --- | --- | --- |
| Capacitor packaging | Done | Real 15×15 match played on a Pixel 3a emulator |
| Desktop mobile harness | Done | 5 phone profiles × 7 routes, all green |
| In-app auth (sign in / up / reset) | Done | Wrong-password login hit production API from device |
| Android shell (back link, back button) | Done | 4 back cases verified on device |
| Board camera (pan / pinch / follow) | Done | Synthesised multi-touch; tiles 28→44 CSS px |
| Asset diet | Done | 150.1 → 49.4 MB |
| Audio transcode | Done | 13/13 tracks decode on device |
| Self-hosted fonts | Done | 22 faces, zero external requests |
| Touch CSS in the WebView | Done | Computed styles checked on device |
| **Play Billing — client** | **Done** | 32 unit tests; native plugin compiles |
| **Play Billing — server** | **NOT STARTED** | Blocked, see §3 |
| **Play Console + 12 testers** | **NOT STARTED** | Blocked on identity verification |

Test suite: **1657 / 1657** green, and `platform-api` **424 / 424**.

Landed alongside the port (not part of it): the six new player badges — five ladder
ascent badges awarded off a new `game_ratings.peak_rating` column (migration 029),
plus a derived Skin Collector at 15 skins. Migration 029 has been applied.

---

## 2. How the build works

`mobile/tactical-arena/` is a Capacitor project **outside** the web tree. It never
edits the game; it copies it.

`scripts/build-www.mjs` assembles the payload and preserves the repo-relative shape,
because the game reaches shared modules via `../../../../js/platform/**`:

```
www/games/tactical-arena/...   the game
www/js/platform/...            shared platform modules
www/index.html                 redirect into the game
```

Then four payload-only transforms run, in order:

1. **`optimize-images.mjs`** — re-encodes to WebP q90/method4 (116 → 35 MB).
2. **`optimize-audio.mjs`** — MP3/WAV → AAC `.m4a` (13.5 → 9 MB) and repoints the
   two audio catalogs, failing the build on a dangling reference.
3. **`bundle-fonts.mjs`** — self-hosts Cinzel + Spectral (latin only, 22 faces).
4. **`enable-touch-css.mjs`** — strips `(pointer: coarse)` from the payload's CSS.

All are cached in `.asset-cache/`, so a rebuild is ~1.3 s versus ~41 s cold.

### Commands

```powershell
# from mobile/tactical-arena
npm run build:www        # payload only
npm run sync             # payload + cap sync
npm run apk              # incremental build  (size NOT trustworthy — see §5)
npm run apk:clean        # clean build        (use this to measure size)
npm run verify:android   # install, launch, screenshot, scrape logcat
npm run play:products    # list the 317 Play products
npm run play:sync        # dry run; --apply --key=sa.json to create them

# from games/tactical-arena
npm test                 # full suite
npm run mobile           # interactive phone-emulated Chrome, playable with a mouse
npm run mobile:shots     # headless screenshot matrix + tile-size measurements
```

---

## 3. Remaining work

### 3a. Server-side purchase verification — **the last engineering piece**

Everything client-side is done and tested. What is missing is one endpoint in the
**root `platform-api/`**:

```
POST /payments/tactical-arena/play-purchases
Authorization: Bearer <factory token>
body: { gameSlug, productId, purchaseToken, orderId }
->    { ok, consume, entitlements, progress }
```

It must:

1. Authenticate the factory token → `playerId`.
2. Resolve `productId` from the **server's own** catalog — never trust the client
   about what was bought (same rule the Stripe path already follows).
3. Verify the token with Google:
   `GET androidpublisher/v3/applications/com.jayarcade.tacticalarena/purchases/products/{productId}/tokens/{token}`
   Require `purchaseState === 0` (purchased).
4. Grant the entitlement idempotently, keyed on `orderId` — a replayed token must
   not grant twice. Boot recovery *will* resubmit tokens.
5. Return `consume: true` for `ta.consumable.*`, plus the fresh progress snapshot
   (same shape the Stripe fulfilment returns, so the client merge code is shared).

**Blocked on:** a Google service-account key (see §4). The client already calls this
endpoint via `createPlayPurchaseVerifier()` in `src/platform/playBillingClient.js`.

### 3b. Create the 317 Play products

Play Console's CSV import was **removed in May 2025**. Use the API:

```powershell
npm run play:sync -- --apply --key=sa.json --only=ta.unit.monk   # prove it works
npm run play:sync -- --apply --key=sa.json                        # then all 317
```

### 3c. Play Console + closed test — **the real critical path**

Nothing above matters until this runs. A new personal developer account must pass
identity verification, then run a **closed test with 12+ testers for 14 continuous
days** before production access can even be requested. Start recruiting now.

### 3d. Nice-to-have, not blocking

- iOS: the same Capacitor project plus a Mac, $99/yr, and StoreKit behind the
  existing `purchaseProviders.js` seam.
- Mobile UX polish pass on the roster / shop / skin picker now that the phone
  layouts actually apply (they were dead until the touch-CSS fix).

---

## 4. What is blocked, and what unblocks it

One **Google service account** unblocks both remaining engineering items:

1. Create it in Google Cloud; grant the `androidpublisher` scope.
2. In Play Console → **Users & permissions**, grant it on this app:
   - *Manage store presence* → product creation (§3b)
   - *View financial data* → purchase verification (§3a)
3. Download the JSON key. **Never commit it** — `*service-account*.json` is
   gitignored. It can publish to your store.

---

## 5. Gotchas that cost real time

Each of these was discovered the hard way. Do not rediscover them.

- **`(pointer: coarse)` is false in the Android WebView.** So is
  `any-pointer: coarse`, while `maxTouchPoints` is 5 and touch events fire. Twelve
  media queries across six stylesheets were silently dead in the app. Keep writing
  `@media (pointer: coarse)` in shared CSS — `enable-touch-css.mjs` strips it from
  the payload. Do **not** re-gate shared CSS onto a JS attribute; that was tried and
  reverted (it breaks the media-query strings `mobile-playability.test.js` asserts).

- **Incremental `assembleDebug` reports a wildly wrong APK size.** It reuses the old
  zip layout and leaves gaps: a 54 MB APK measured 143 MB. Always measure with
  `npm run apk:clean`.

- **`cap sync` is not optional.** Running Gradle alone silently ships the previous
  payload. Two hours were nearly lost to this.

- **`env(safe-area-inset-*)` is 0 on Android** — it reports display cutouts only,
  never system bars. The WebView is already inset (`innerHeight` 345 vs `screen`
  393); system bars do **not** overlap content.

- **With the keyboard up there are ~121 CSS px of viewport** in phone landscape.
  Size off `--app-height` (which `mobileViewport.js` syncs from `visualViewport`),
  never `vh` — `vh` does not shrink for the keyboard.

- **A flex child that must scroll needs `min-height: 0`**, not just `overflow-y: auto`.

- **`grid-template-columns: 1fr 1fr` clips form fields.** A bare `1fr` is
  `minmax(auto, 1fr)` and `auto` bottoms out at a text input's intrinsic width. Use
  `repeat(2, minmax(0, 1fr))` plus `width: 100%; min-width: 0` on the input.

- **Play product IDs forbid hyphens** (`a-z0-9._` only). Every game SKU has them.
  `src/platform/playProducts.js` maps them; a test guards the whole catalog.

- **Android has no consumable product type.** Every one-time product is
  `purchaseType: managedUser`; consumability is decided at runtime by calling
  `consumeAsync` instead of `acknowledgePurchase`.

- **Debug the running app over CDP** rather than guessing:
  ```bash
  PID=$(adb shell pidof com.jayarcade.tacticalarena | tr -d '\r')
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
  curl -s http://localhost:9222/json
  ```
  Puppeteer cannot enumerate pages on this older WebView — talk raw CDP with Node's
  built-in `WebSocket`. Remember `adb forward --remove-all` afterwards.

---

## 6. Decisions already made

| Decision | Why |
| --- | --- |
| Capacitor, not a TWA | A TWA points at the live URL, so every mobile change *is* a web change |
| Play Billing, not external billing | US policy allows external billing, but it still costs 10% to Google **plus** PCI-DSS scope, 24 h transaction reporting and owning refunds. Play Billing is ~15% all-in with none of that |
| Custom native plugin | ~250 lines of Java against Billing Library 8.2.0; no third-party dependency, no vendor cut, and it satisfies the 31 Aug 2026 Billing-8 requirement by construction |
| Landscape only | Forcing a rotate to type would be worse than a cramped form. The auth panel goes two-column in landscape instead |
| Sell individual skins on mobile | Product decision — hence 317 products and the API sync script |
| Payload transforms, not source edits | Keeps the web app byte-identical while the app gets smaller, faster, offline-capable assets |

---

## What the web build gave up

Exactly **one** intentional change, and it was a bug fix:

`games/tactical-arena/index.html` requested Spectral as `...1,500,600...` where it
should have been `1,500;1,600`. Google rejected the entire query with **HTTP 400**,
so neither Cinzel nor Spectral ever loaded and everything fell back to Georgia.
Fixed; the web build now registers 43 font faces where it registered 0.

Everything else is either runtime-gated (`isNativeApp()`, which is false in every
browser) or a build-time payload transform.

---

## Open questions for the owner

1. **Build the server endpoint against a faked Google response now**, so the grant
   path is tested and credentials drop in later? Or wait so it can be verified
   against real responses first? (It is production payment code.)
2. Android Studio is at **2023.2**. Irrelevant for the CLI build loop, but opening
   the project in the IDE will want Ladybug+ for AGP 8.7.
