# Tactical Arena — Android Port Handoff

Status as of 2026-07-27. Read this first if you are picking the port up cold.

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
| **Play Billing — client** | Done | 32 unit tests; native plugin compiles |
| **Play Billing — server** | **Done** | 26 unit tests against faked Google responses; needs a key to run live (§4a) |
| **Release signing / AAB** | **Done** | Signed 51.3 MB AAB built and verified with `jarsigner` |
| **Play Console + 12 testers** | **NOT STARTED** | Now unblocked — this is the whole critical path (§5) |

Test suite: **1671 / 1671** green, and `platform-api` **450 / 450**.

Identity verification passed on 2026-07-27, so nothing is blocked on Google any more.
Every remaining item is either console clicking or waiting out the 14-day closed test.

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
npm run icons            # regenerate launcher + store icons from the shield logo
npm run release:check    # preflight: signing, versionCode, payload freshness, product count
npm run bundle:release   # signed AAB for Play  -> app/build/outputs/bundle/release/
npm run apk:release      # signed release APK, for testing the release build on a device

# from games/tactical-arena
npm test                 # full suite
npm run mobile           # interactive phone-emulated Chrome, playable with a mouse
npm run mobile:shots     # headless screenshot matrix + tile-size measurements
```

---

## 3. Server-side purchase verification — shipped

The endpoint the client has always called now exists in the **root `platform-api/`**:

```
POST /payments/tactical-arena/play-purchases
Authorization: Bearer <factory token>
body: { gameSlug, productId, purchaseToken, orderId }
->    { ok, alreadyProcessed, consume, entitlements, progress }
```

`src/services/play-billing.mts` owns it, deliberately separate from the 970-line
`payments.mts` rather than bolted onto it. It shares the Stripe path's catalog and its
`resolveTacticalArenaPremiumOffer` pricing, so the two payment rails cannot drift on what
a purchase is worth.

The trust model is the Stripe one, unchanged: the client names a Play **product**, never
an entitlement. The server re-resolves that product against its own catalog, asks Google
whether the token is real and paid, and only then grants.

What it enforces, and where each rule is tested (`platform-api/tests/play-billing.test.mjs`):

| Rule | Why it exists |
| --- | --- |
| Product resolved from the server catalog | A forged `productId` finds nothing and costs no Google call |
| `purchaseState === 0` required | Cancelled and pending purchases grant nothing; pending returns its own code so the client knows to retry |
| Google 5xx fails closed | An outage must never fall back to granting on trust |
| Grant keyed on **Google's** `orderId` | The client cannot choose its own claim id; a replay hits the existing claim row |
| Token hash bound to one account | Play tokens are bearer values — without this, a shared token grants twice under two accounts |
| A token on one of **our** claim rows returns `ok` | Boot recovery must be able to acknowledge a purchase whose grant landed but whose settle call failed, or Google refunds it |
| A *new* token buying an *owned* item is **refused** | See below — this is the double-purchase fix |
| Raw purchase token never stored | Only a SHA-256 hash, which is enough to match a voided token back to its grant |

### Buying something you already own

Google Play cannot see items bought on the web through Stripe, so left alone it will happily
sell one again. Two layers stop that, and the order matters.

**1. The preflight — no charge ever happens.** `createOwnedOfferGuard()` in
`playBillingClient.js` asks the server what the player owns and refuses **before**
`bridge.purchase()` opens Google's sheet. This is what makes Play match the Stripe rail,
which has always been safe for free: the server refuses to create a checkout session for an
owned offer, so money never moves there either.

`src/platform/offerOwnership.js` holds the rule, and it deliberately mirrors
`resolveTacticalArenaPremiumOffer` — including that a **partially** owned skin pack is still
buyable, because the server prorates it down to the missing skins. A test cross-checks the
two implementations case by case; if they drift, the client starts blocking sales the server
would have honoured.

It **fails open**. If the snapshot cannot be fetched — offline, signed out, server down — the
purchase proceeds. A network blip must not block a legitimate sale, and an unreachable server
could not have verified the purchase anyway.

**2. The backstop — refund.** For the narrow race where ownership changes between the
preflight and the sheet closing (bought on another device mid-flow), the server still refuses
the grant. Two situations look identical there, and the discriminator is whether *this
purchase token* is already on one of our claim rows:

- **Our claim exists** → the grant landed, only the acknowledge failed, boot recovery is
  retrying. Return `ok` so the client can settle it.
- **No claim** → they paid for something they already owned. Return `409
  offer_already_owned`, and the client leaves the purchase **unacknowledged, so Google
  auto-refunds it within three days.**

The two paths carry different player-facing copy on purpose: the preflight says "you have not
been charged", the backstop promises a refund. Getting those the wrong way round is worse
than saying nothing.

Configuration — set both on the platform-api service (Railway):

```
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY   the service-account JSON, raw or base64
GOOGLE_PLAY_PACKAGE_NAME          optional; defaults to com.jayarcade.tacticalarena
```

Without the key the route returns `503 play_billing_not_configured` and grants nothing,
so deploying before the key is in place is safe.

Base64 is there because hosts that pass env vars through a shell mangle the embedded
newlines in `private_key`. If in doubt, use base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("sa.json"))
```

### Remaining polish, not a correctness gap

A blocked purchase now applies the fresh snapshot it fetched, so the shop corrects itself
after the first refusal. What is still missing is refreshing ownership when the shop *opens*,
so a stale item is never offered in the first place. That needs `shop.js`, which was being
edited concurrently when this landed — see the note at the end of §6.

---

## 4. Launch runbook

Everything below is console work. Do it in order; 4a and 4b are independent of each other.

> **`LAUNCH_CHECKLIST.md` is the owner-facing version of this section** — same steps, written
> for whoever is clicking through Play Console rather than for whoever is reading the code.
> Keep the two in sync when the process changes.

### 4a. Google service account (unlocks product sync + purchase verification)

1. **Google Cloud Console** → create or pick a project → *APIs & Services* → *Library* →
   enable **Google Play Android Developer API**.
2. *IAM & Admin* → **Service Accounts** → *Create service account*. Name it something
   like `play-verifier`. No project-level roles are needed — Play grants its own.
3. On the new account → *Keys* → *Add key* → *Create new key* → **JSON**. It downloads
   once. **Never commit it**; `*service-account*.json` is gitignored.
4. **Play Console** → *Users & permissions* → *Invite new users* → paste the service
   account's email (`...@....iam.gserviceaccount.com`) → grant **on this app**:
   - **View app information** and **View financial data** → purchase verification (§3)
   - **Manage store presence** → product creation (4c)
5. Permissions take a few minutes to propagate. Prove it works on one product before
   doing all 317:
   ```powershell
   npm run play:sync -- --apply --key=sa.json --only=ta.unit.monk
   ```
6. Put the same key on the API as `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` (§3).

### 4b. Upload keystore (unlocks any Play upload)

Generate it once, outside the repo, and **back it up somewhere that is not this machine**.
Losing it means losing the ability to update the app.

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore tactical-arena-upload.jks -alias upload `
  -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties` (gitignored):

```properties
storeFile=../../tactical-arena-upload.jks
storePassword=<what you just typed>
keyAlias=upload
keyPassword=<what you just typed>
```

`storeFile` is resolved relative to `android/app/`, not `android/`. An absolute path is
fine and less error-prone. Verify with `npm run release:check`.

With the file absent the release build simply goes unsigned, so a machine without the
keystore can still build and test.

### 4c. Create the 317 Play products

Play Console's CSV import was **removed in May 2025**, so the API is the only practical
route for a catalog this size.

```powershell
npm run play:sync                                  # dry run, no key needed
npm run play:sync -- --apply --key=sa.json         # all 317
```

Products can only be created **after** an app bundle has been uploaded to some track —
Play refuses in-app products for an app with no release. Do 4d first if it errors.

### 4d. First upload

```powershell
npm run release:check                              # catches the expensive mistakes first
npm run bundle:release -- -PtaVersionCode=1 -PtaVersionName=1.0
```

Upload `android/app/build/outputs/bundle/release/app-release.aab`. Every later upload
needs a **higher** `versionCode`; Play never accepts a repeat, and it can never go down.

Store listing needs, none of which exist yet:

- App icon 512×512, feature graphic 1024×500
- At least 2 phone screenshots — `npm run mobile:shots` produces a matrix, or pull real
  ones off a device
- Short (80 char) and full (4000 char) description
- **Privacy policy URL** — mandatory, and the app does collect accounts/email
- Content rating questionnaire
- **Data safety** form — declare the account/email collection and the Stripe/Play payment
  processing honestly; a mismatch here is a common rejection
- Target audience, ads declaration (none), and the **in-app purchases** declaration

### 4e. Closed test — the 14-day clock

This is the real critical path and nothing shortens it. A personal developer account must
run a **closed test with 12+ testers opted in for 14 continuous days** before production
access can even be *requested*.

- Create a closed track, add an email list of 12+ real Google accounts.
- The count is of testers **opted in**, not invited. Chase the opt-ins.
- The 14 days are continuous — if you drop below 12, expect the clock to restart.
- Testers must install from the opt-in link, not sideload.
- **Purchases in a closed test are real money unless the account is on the licence-test
  list.** Play Console → *Setup* → *License testing* → add the tester emails; their
  purchases then run through the full billing flow, including your server verification,
  without charging anyone.

Start recruiting before the build is perfect — the clock is the long pole, not the code.

### 4f. Nice-to-have, not blocking

- iOS: the same Capacitor project plus a Mac, $99/yr, and StoreKit behind the
  existing `purchaseProviders.js` seam.
- Mobile UX polish pass on the roster / shop / skin picker now that the phone
  layouts actually apply (they were dead until the touch-CSS fix).
- Refund/void handling for Play. Stripe has webhook-driven revocation; Play does not yet.
  The grant stores `playPurchaseTokenHash`, so Google's Voided Purchases API can be polled
  and matched against it when this becomes worth building.

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
  `consumeAsync` instead of `acknowledgePurchase`. The **server** decides which, and
  returns it as `consume` — the offer kind is only the client's fallback.

- **`apksigner` cannot verify an AAB** — it reports `Missing AndroidManifest.xml`,
  which looks like a broken build but is not. A bundle uses JAR signing:
  `jarsigner -verify -verbose:summary -certs app-release.aab`.

- **`storeFile` in `keystore.properties` resolves relative to `android/app/`**, not
  `android/`, because Gradle's `file()` resolves against the project dir. An absolute
  path avoids the whole question. `npm run release:check` checks it either way.

- **Play will not create in-app products until a bundle has been uploaded** to some
  track. If `play:sync` errors on a brand-new app, upload first and re-run.

- **Inspect what the app actually synced by reading its localStorage** — the server snapshot
  lands in `serverEntitlementUnits` / `…Skins` / `…Avatars` inside
  `tacticalArenaTutorialProgressV2`, so this answers "did progress reach this device"
  without needing DB credentials:
  ```bash
  PKG=com.jayarcade.tacticalarena
  adb shell am force-stop $PKG        # REQUIRED — see below
  adb exec-out "run-as $PKG tar -c 'app_webview/Default/Local Storage/leveldb'" > ls.tar
  tar -xf ls.tar -C outdir
  cat "outdir/app_webview/Default/Local Storage/leveldb/"* | tr -d '\000' \
    | grep -aoE 'serverEntitlementUnits.{0,400}'
  ```
  **Force-stop first or the dump lies.** Chromium batches localStorage writes into leveldb;
  a dump taken while the app runs shows stale, half-empty state. During the 2026-07-27
  sync investigation this made a working sync look like it had never run, repeatedly.
  Values are UTF-16 (hence `tr -d '\000'`); keys are plain ASCII. `run-as` needs the debug
  build.

- **`npm run apk` fails in Git Bash** — `gradlew.bat` is not recognized. Use
  `cd android && ./gradlew.bat assembleDebug`, or run the npm script from PowerShell.
  Related: `adb shell df /data` needs `MSYS_NO_PATHCONV=1` in Git Bash, and installs fail
  with `INSTALL_FAILED_INSUFFICIENT_STORAGE` well before the device looks full.

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

1. ~~Build the server endpoint against a faked Google response now?~~ **Answered: built
   that way.** 26 tests cover it against faked responses. It has never seen a real Google
   response — the first live purchase in the closed test is the real proof, so make that
   purchase with a licence-test account and watch the API logs.
2. Android Studio is at **2023.2**. Irrelevant for the CLI build loop, but opening
   the project in the IDE will want Ladybug+ for AGP 8.7.
3. `platform-api/tests/` is gitignored by the root `.gitignore` (`tests/`, with a
   negation for `games/*/tests/` but not for `platform-api/`). Only 2 of its 49 test
   files are tracked, so the new payment-verification suite will not commit without
   `git add -f` or a negation rule. Worth deciding deliberately — this is security-
   critical test coverage that currently lives only on this machine.


## NOTES AFTER FIRST PLAY: 

App needs to force full screen, it’s leaving a bar at the top and it’s fucking with my ui

Also my campaign and tutorial progress needs to migrate over, it’s dumb i have to do all of the campaign missions and tutorials from my account again. It also appears that my skin progress has also been wiped when i login to my account from the app.
"C:\Users\leoja\Downloads\Screenshot_20260727-141525.png"
"C:\Users\leoja\Downloads\Screenshot_20260727-141557.png"
"C:\Users\leoja\Downloads\Screenshot_20260727-141612.png"
"C:\Users\leoja\Downloads\Screenshot_20260727-141633.png"

Units in multiplayer squad selector have different sized buttons, they need to be fixed size this shit looks so fucking stupid: "C:\Users\leoja\Downloads\Screenshot_20260727-135951.png"

Got stuck after a turn cycle because the fucking camera doesn’t pan after the opponent’s turn and i can’t fucking move it either so my units are fucking stuck off screen. Camera system needs some fixing, i should be able to move the camera before activating a unit if it’s my turn. "C:\Users\leoja\Downloads\Screenshot_20260727-140218.png"

Account view should also say my account name, not just “you are signed in”

### What was fixed (all five, 2026-07-27)

1. **Full screen.** `MainActivity.goFullScreen()` sets `setDecorFitsSystemWindows(false)` and
   hides the system bars with `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` (sticky immersive), re-run
   on `onWindowFocusChanged` so they do not linger after a swipe or an app switch. Both themes
   get transparent bars and `windowLayoutInDisplayCutoutMode=shortEdges`. This also hands the
   layout back the ~48px the status bar was taking off an already-short landscape viewport (the
   WebView is *inset* by the bars on Android, it is not overlapped — see the layout facts above).

2. **Campaign / tutorial / skin progress migration.** Root cause: play progress was never
   server-backed. Valor and entitlements synced; *which missions are cleared, their stars, and
   which tutorials are done* lived only in localStorage, so a second device started from zero —
   and any reward derived from that progress went with it.
   `src/platform/playProgressSync.js` now syncs it both ways (new `campaign-progress` claim kind
   + `completedTutorials` on the progress snapshot), with a one-time per-device backfill of what
   this device already had. The wiped skin was the *tutorial reward skin pick*
   (`magician / summer-vibes`): a player choice with no record other than the local field, which
   the authoritative ownership merge correctly dropped on a device that had never made it. The
   backfill now asserts reward picks as claims, so the entitlement reaches the account.
   **The web device has to boot online once** to push its backfill up before the phone sees it.

3. **Roster card sizing.** `.roster-class-units` gets a fixed `grid-auto-rows`, and `.roster-unit`
   an explicit portrait / name / flag row template, so the flag slot stays reserved on unlocked
   units and a two-line name cannot grow the card. Verified at 820x360: every card 73.2x84.

4. **Board clipped / camera.** The war-table dais is drawn *outside* the tile grid, but
   `createBoardViewBox` only framed the grid. SVG clips to the viewport, not the viewBox, and
   `preserveAspectRatio: meet` leaves zero slack on the tight axis — so on a short landscape
   screen the bottom of the board was cut off, which is what put units out of reach. The viewBox
   now unions in `getBoardDaisExtent` (guarded by a test at every board size). Separately,
   `boardRenderer` now follows `state.activation.unitId` when nothing is selected locally, so a
   zoomed-in camera tracks the CPU's / opponent's piece through their turn instead of sitting
   still. Drag-pan stays gated on `zoom > 1`, which is now truthful: at zoom 1 the whole board
   really does fit.

5. **Account name.** `/auth/login` never returned `profileName` (only `/auth/register` did), so
   the app had nothing to show. Login and `/auth/me` now include it, and
   `refreshAccountProfileName()` back-fills it once for anyone already signed in.
