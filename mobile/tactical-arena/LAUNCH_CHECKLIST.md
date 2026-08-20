# Tactical Arena on Google Play — Owner's Checklist

Everything **you** need to do, in order. Updated 2026-08-20: **production access granted**.
The 14-day closed-test clock is done; what follows is the production release itself.

`HANDOFF.md` is the engineering doc; this one is the console/account work that only you can
do. Where a step needs code or assets, it says who does it.

## Production release — do these in order

1. [ ] `npm run release:check` (green as of 2026-08-20, versionCode **12** / 1.1.0)
2. [ ] `npm run bundle:release` → upload the AAB to **Production**
3. [ ] Finish the store listing (step 5) and the Data safety + content rating forms (step 6)
4. [ ] `npm run play:sync` — the renamed "Fight Cancer" titles are still unpushed (step 6c)
5. [ ] Roll out. Watch crash/ANR for a day at a partial rollout before going to 100%
6. [ ] **Only after 100% rollout**, if you need to retire build 11, set the update gate's
       minimum — see the ordering warning below

> ### ⚠️ The forced-update gate
> The app now checks on boot whether its build is still supported and hard-blocks with an
> "Update on Google Play" screen if not. It is **off until you configure a minimum**, and it
> should stay off until you actually need it.
>
> Set it with `TA_ANDROID_MIN_VERSION_CODE` on the Railway platform-api service (or the
> `app_release:com.jayarcade.tacticalarena:android` site setting).
>
> **Never raise the minimum before the new build is live and at 100% rollout.** Doing so
> blocks installed copies and sends them to a listing that still offers the old build — the
> player has no way out, because the gate is deliberately non-dismissable. At a 20% staged
> rollout, 80% of players cannot get the build you would be demanding.
>
> Full detail: `HANDOFF.md` §3b.

---

## Where things stand

| | |
| --- | --- |
| The app | **Tested** on the Play-installed build — gameplay and shop work |
| Purchases (client + server) | **Verified end-to-end** with a licence-test purchase; server validation and entitlement/progress grant succeeded |
| Release signing | **Done** — signed AAB uploaded to the closed test 2026-07-29 |
| App icon | **Done** — the shield mark, generated at all five densities |
| Store listing icon (512×512) | **Done** — `store-listing/play-icon-512.png` |
| Feature graphic (1024×500) | **Done** — `store-listing/play-feature-graphic-1024x500.png` |
| Store descriptions | **Drafted** — `store-listing/DESCRIPTIONS.md`, yours to edit |
| Privacy policy | **Live** — `https://factory.jayarcade.com/privacy`, contact `leojaylorona@gmail.com`. Read it before you submit it (step 4) |
| Site + domain | **Done** — `factory.jayarcade.com`, HTTPS enforced, Railway auto-deploy reconnected |
| Progress sync (web ↔ app) | **Fixed and verified on login** 2026-07-29 — units, skins, Valor, tutorials, and campaign restore from the server |
| Screenshots | Three phone screenshots prepared in `store-listing/` |
| Play Console app entry | **Done** — closed-test release published; all testers have the opt-in link and 11 are opted in as of 2026-07-29 |

The uploaded release package contains the native Play Billing bridge and the shop's open-time
ownership refresh. No replacement AAB is required for the product-catalog fix. The shop,
Google test-payment sheet, server verification, and entitlement/progress update have now
been proven end-to-end.

---

## Your critical path

1. [x] Generate the upload keystore
2. [x] Create the Google service account
3. [x] Create the app in Play Console
4. [x] Publish a privacy policy
5. [ ] Assemble the store listing
6. [ ] Fill the Data safety + content rating forms
6b. [x] Renamed the 31 cancer-research products to "Fight Cancer" and named the charity — see below.
6c. [ ] `npm run play:sync` to push the renamed titles/descriptions to the Play Console.
7. [x] First Play upload → Closed testing
8. [x] Test on your own phone, including a licence-test purchase
9. [x] Create and activate the 317 in-app products
10. [x] Recruit 12+ opted-in closed testers
11. [x] Wait out 14 days, then request production — **granted 2026-08-20**

Steps 1 and 2 are independent — do them in either order. Step 10 can start the moment step 7
lands; do not wait for the rest to be polished.

---

## 1. Generate the upload keystore

**Do this outside the repo, and back it up somewhere that is not this computer.** If you lose
this file or its passwords, you lose the ability to ship updates. Google can reset an *upload*
key via a support request, but it is a slow, unpleasant process.

```powershell
cd "C:\Users\leoja\Desktop\Dad Games"
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore tactical-arena-upload.jks -alias upload `
  -keyalg RSA -keysize 2048 -validity 10000
```

It will ask for a password (twice) and some identity fields — name, org, city, country. They
appear nowhere public; anything truthful is fine.

Then create `mobile\tactical-arena\android\keystore.properties`:

```properties
storeFile=C:/Users/leoja/Desktop/Dad Games/tactical-arena-upload.jks
storePassword=<the password you just set>
keyAlias=upload
keyPassword=<same password, unless you set a different key password>
```

Use forward slashes even on Windows. This file and the `.jks` are both gitignored.

Check it:

```powershell
cd mobile\tactical-arena
npm run release:check
```

**Back up now:** copy the `.jks` and the passwords to a password manager or an external drive.

---

## 2. Create the Google service account

This one credential unlocks both the automated product creation and the server's ability to
verify purchases.

**In Google Cloud Console** (console.cloud.google.com):

1. Create a project, or pick an existing one.
2. *APIs & Services* → *Library* → search **Google Play Android Developer API** → **Enable**.
3. *IAM & Admin* → *Service Accounts* → **Create service account**.
   - Name: `play-verifier`
   - Skip the optional role and user-access steps — Play grants its own permissions.
4. Click the new account → *Keys* → *Add key* → *Create new key* → **JSON** → Create.
   It downloads once. Save it as `mobile\tactical-arena\play-service-account.json`
   (already gitignored). **Never commit or share it** — it can publish to your store.

**In Play Console** → *Users & permissions* → *Invite new user*:

5. Paste the service account's email (it looks like
   `play-verifier@your-project.iam.gserviceaccount.com`).
6. Under *App permissions*, add Tactical Arena and grant:
   - **View app information and download bulk reports**
   - **View financial data, orders, and cancellation survey responses** ← purchase verification
   - **Manage store presence** ← product creation
7. Invite. Permissions take a few minutes to propagate.

**Then give the same key to the API.** On Railway, add to the platform-api service:

```
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY  = <contents of the JSON, or its base64>
```

Railway can mangle the newlines inside the key, so if purchases fail with a token error, use
base64 instead:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("mobile\tactical-arena\play-service-account.json"))
```

The server accepts either form. Until this is set, purchase verification returns a clean
503 and grants nothing — so it is safe to deploy before you get here.

---

## 3. Create the app in Play Console

*All apps* → **Create app**.

- App name: **Tactical Arena**
- Default language: English (United States)
- App or game: **Game**
- Free or paid: **Free** (it is free to install; purchases are in-app)
- Confirm the declarations

⚠️ **Permanent once set:** the package name `com.jayarcade.tacticalarena`. It cannot ever be
changed, and it is already baked into the build and the server config. Do not let the console
talk you into a different one.

---

## 4. Publish the privacy policy

**Mandatory. Play will not publish without a working URL.**

The page lives at `privacy/index.html`. It covers what is collected, why, the five processors
(Railway, Cloudinary, Stripe, Google Play, Resend), what is public vs private, retention,
deletion, children, and security.

**Done as of 2026-07-27** — the policy is live at `https://factory.jayarcade.com/privacy`, which
is the URL to give Play. The domain cutover, HTTPS enforcement, `APP_BASE_URL`, and the CORS
allow-list are all in place; see the changelog entry for that date if you need the details.

**What's left on this step is you reading it.** It is a legal statement about your product,
written from what the code does. If any of it is wrong, it needs to be wrong-free before it is
public. Its contact address is `leojaylorona@gmail.com` — swap it in `privacy/index.html` if you
would rather not publish a personal address (a Namecheap forward for `privacy@jayarcade.com`
would work; no mailbox exists on the domain today).

One claim worth confirming before you submit: it says account deletion removes your profile,
images, posts, messages, friendships and gameplay records. `deleteAccountService` exists, but
delete a throwaway account and check what actually disappears.

**Do not touch the apex `jayarcade.com`.** It belongs to the `loronajay/games-directory` repo —
Jay's Retro Arcade and the Cabinet OS the Pi kiosks pull from. GitHub allows one repo per
domain, so reassigning it takes that site and the cabinets down. This app lives on the
`factory.` subdomain precisely to avoid that.

---

## 5. Assemble the store listing

**Ready to use** (all in `mobile/tactical-arena/store-listing/`):

| Asset | File |
| --- | --- |
| App icon 512×512, opaque | `play-icon-512.png` |
| Feature graphic 1024×500 | `play-feature-graphic-1024x500.png` |
| Short + full description drafts | `DESCRIPTIONS.md` |

Regenerate the two images any time with `npm run icons`.

The descriptions are a draft in your product's voice, not mine to finalise — read them and
cut anything that overclaims. `DESCRIPTIONS.md` ends with a table of every factual claim it
makes and where that claim comes from, so you can check them off.

**Still needed:**

| Asset | Spec | Notes |
| --- | --- | --- |
| Phone screenshots | 2–8, min 320px, landscape | `npm run mobile:shots` generates a matrix, or pull real ones off your phone |

The app is **landscape-only**, so use landscape captures. Take them *after* your UI pass, not
before — otherwise you will redo them.

---

## 6. Data safety and content rating

Both are questionnaires in Play Console. Neither is hard; both are worth answering carefully,
because a mismatch between what you declare and what the app does is a common rejection.

**Data safety** — declare honestly:

- Collects: email address, name/display name, photos (avatar/profile uploads), in-app purchase
  history, gameplay data
- Data is transmitted encrypted (HTTPS) — true
- Users can request deletion — **true, in-app and on the web.** The in-game Account menu has a
  confirm-gated *Delete Account*, and the deletion URL to give Play is
  `https://factory.jayarcade.com/me/edit/`. Deletion removes the profile *and* the per-game
  economy (entitlements, Valor, claims, campaign progress, ranked standing, TA friends); the
  only retained records are the moderation audit log and reports filed about other people's
  content. Answer "account and data are deleted", not "data only".
- Payments run through Stripe and Google Play; you do not store card details — true, and worth
  stating plainly

**Content rating** — answer the questionnaire. Tactical Arena is fantasy combat with no blood,
no real-world violence, no gambling. Expect roughly **Everyone 10+ / PEGI 7**.

One question deserves care: there **is** user-to-user interaction (friends, profiles, and the
shared factory social layer). Declare it. Under-declaring social features is a classic
rejection reason.

### The cancer-research collection — renamed to "Fight Cancer"

**Done in code (2026-08-13).** The 30 skins and the $49.99 pack now display as **Fight Cancer**
/ **Fight Cancer Pack**. Two problems drove it, neither of which was about the art:

1. **Profanity in IAP titles.** `play-products-sync.mjs` builds every Play product title from
   the game's own offer names, so the old name *was* the title Google shows in the purchase
   sheet and reviews as metadata. It also contradicted the Everyone 10+ / PEGI 7 rating.
2. **A real charity's name.** Fuck Cancer is a registered 501(c)(3), so the old name read as
   affiliation — trademark exposure independent of Google, and masking it ("F&%!") would not
   have helped, since the charity brands itself with exactly that stylization.

**The slugs did not change and must not** — `fuck-cancer` names the asset files
(`fuck-cancer-archer.webp`), the entitlement ids (`skin:archer:fuck-cancer`) and the Play
product ids (`ta.skin.archer.fuck_cancer`), none of which can change once published. Only
display strings moved: `SKIN_DISPLAY_NAMES` + `PACK` in `games/tactical-arena/src/ui/skinModel.js`,
`skinPackName` in `platform-api/src/services/payments.mts`, and the badge copy in
`services/game-badge-catalog.mts`. `games/tactical-arena/tests/store-metadata.test.js` guards
all of it and fails if profanity reappears in any store-facing string.

**The pledge is now a public, specific promise:**

> 100% of proceeds from this skin are donated to The V Foundation for Cancer Research, sent annually.

It lives in `CANCER_RESEARCH_DONATION_NOTE` (`games/tactical-arena/src/ui/skinModel.js`) — one
string; the pack-level wording ("this pack") derives from it. `release-check.mjs` blocks an
upload if a template placeholder is ever left in a store-facing string.

The V Foundation was chosen so the claim stays literally true: it funds cancer research
exclusively, and its own policy that 100% of direct donations reach research is consistent with
the 100% pledged here. **Verify its current Charity Navigator / Candid rating and that policy
before launch** — and remember this is a commitment you now have to honour and be able to
evidence. Changing recipient is one string plus a `play:sync`.

**After any name/pledge change, re-run `npm run play:sync`** so the 31 Play Console titles and
descriptions follow. The product *ids* are unchanged, so this is an update, not a re-creation.
**Until that sync runs, the purchase sheet still shows the old titles** — the app build alone
does not change them.

---

## 7. First upload → Internal testing

Internal testing is the fastest track: up to 100 testers, live within minutes, no full review.
It is how you get billing working on your own phone.

```powershell
cd mobile\tactical-arena
npm run release:check
npm run bundle:release
```

Upload `android\app\build\outputs\bundle\release\app-release.aab` to *Testing → Internal
testing → Create new release*.

Play will offer **Play App Signing** — accept it. It means Google holds the real signing key
and your `.jks` is only an upload key, which is the recoverable arrangement.

Then: *Testers* tab → create an email list → add your own Google account → save → copy the
**opt-in URL**.

⚠️ Every later upload needs a **higher** `versionCode`. It can never repeat and never go down.
For version 2, pass the properties directly to Gradle so PowerShell/npm does not mangle them:

```powershell
npm run sync
cd android
.\gradlew.bat clean bundleRelease "-PtaVersionCode=2" "-PtaVersionName=1.0.1"
cd ..
```

---

## 8. Test on your phone

### Gameplay, UI, accounts — works right now, no console needed

On the phone: *Settings → About phone* → tap **Build number** seven times → back → *Developer
options* → turn on **USB debugging**. Plug into the PC, accept the RSA prompt.

```powershell
cd mobile\tactical-arena
npm run apk
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices     # must show "device", not "unauthorized"
& $adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Or `npm run verify:android`, which installs, launches, screenshots to `.device-shots\`, and
scrapes logcat for errors. Use that one — a Capacitor app that fails to boot shows a white
screen while every adb command still reports success, so "it installed" proves nothing.

This debug build talks to the **production** API, so real sign-in, ranked, friends, and
campaign progress all work.

### Purchases — completed 2026-07-29

Billing does **not** work from a sideloaded debug APK. Play only honours purchases for an app
it distributed. After the internal-testing upload:

1. Play Console → *Setup* → **License testing** → add your Google account.
2. Open the internal-testing **opt-in URL** on the phone, accept, install from Play.
3. Buy something in the shop.

As a licence tester you will see "Test card, always approves" and **will not be charged** — but
the entire real flow runs, including server verification. This was completed successfully
from the Play-installed build: the shop worked, Google approved the test payment, and the
account's entitlement/progress updated.

**Watch the API logs during it.** If something is wrong, it shows up as
`play_verification_not_configured` (key missing/not propagated) or `purchase_not_found`
(package name or product id mismatch).

---

## 9. Create the 317 in-app products

Play removed CSV import in May 2025, so this is scripted.

**Done 2026-07-29.** The proof product succeeded, then all 317 products synchronized and
activated. Play Console shows the products with active purchase options. Google may take up
to 24 hours to propagate the full catalog to tester devices.

```powershell
cd mobile\tactical-arena
npm run play:sync          # dry run, no key needed
npm run play:sync:proof    # create/activate ta.unit.monk first
npm run play:sync:apply    # then create/activate all 317
```

Products can only be created **after** a bundle has been uploaded (step 7). If the script
errors on a fresh app, that is why. The full sync uses Google's high-throughput publishing
mode, so the complete catalog can take up to 24 hours to appear on tester devices.

⚠️ **A Play product ID can be deactivated but never deleted or reused.** So before running the
full sync, settle anything that changes the *set* of products — adding, removing, or renaming a
unit or a skin. Price changes are fine at any time; just re-run the sync.

Your balance pass mostly does not affect this. The exception: unit USD prices are derived from
**star tier**, so re-starring a unit changes its price. There is now a test that fails when the
game and server disagree; when it does, update the server catalog and re-run this sync.

---

## 10. The closed test — start this early

*Testing → Closed testing → Create track.*

**Current status (2026-07-29):** the opt-in link has been sent to every tester and 11 are
opted in. One more tester must opt in to reach the 12-tester requirement.

- Add an email list of **12+ real Google accounts**. Friends, family, anyone who will actually
  opt in.
- The requirement counts testers **opted in**, not invited. Chase the opt-ins; this is where
  people stall.
- The 14 days are **continuous**. Dropping below 12 can restart the clock. Recruit 15+ for
  slack.
- Testers must install from the opt-in link, not sideload.
- Add them to **License testing** too if you want them buying things without being charged.

You can keep shipping new builds to this track the whole time. Balance changes, UI fixes, bug
fixes — all fine, none of it resets the clock. **Do not wait for the game to be finished
before starting this.**

---

## 11. Request production

After 14 continuous days with 12+ testers, the *Production* track unlocks a **Apply for
production access** flow. Expect to describe your testing and what you changed from feedback.
Review after that is typically days, not weeks.

---

## Things that are permanent — do not get these wrong

| Thing | Why it is permanent |
| --- | --- |
| Package name `com.jayarcade.tacticalarena` | Cannot ever be changed. A new one is a new app with no users. |
| Upload keystore | Losing it means a support request to reset. Back it up off-machine. |
| `versionCode` | Never repeats, never decreases. |
| In-app product IDs | Deactivatable, never deletable or reusable. |
| The first app-signing key | Fixed at first upload. Accept Play App Signing so this is Google's problem, not yours. |

---

## What to hand me

Done: the privacy policy, the feature graphic, the descriptions, the duplicate-purchase
hardening (a purchase of something you already own is refused **before** Google's payment sheet
opens, so no money moves at all), the `factory.jayarcade.com` cutover, and the web↔app progress
sync fix. The Play-installed app, shop, login-time progress refresh, service-account
configuration, and licence-test purchase flow have all been verified end-to-end.

Still open, and each needs something from you:

- [ ] **Rotate the Postgres password.** It was pasted into a chat transcript on 2026-07-27 while
      debugging. Railway → Postgres → Variables → regenerate; services referencing
      `${{Postgres.DATABASE_URL}}` pick it up on redeploy.
- [ ] **Read the privacy policy** and settle its contact address (step 4).
- [ ] **Finish/review the Play screenshots.** Three phone screenshots are already in
      `store-listing/`.
- [ ] **Get one more tester opted in.** Every tester has the closed-test opt-in link and
      Play Console currently reports 11 opted-in testers; keep at least 12 opted in for
      14 continuous days.

I do **not** need: your keystore passwords or the service-account JSON. Those stay with you
and should be entered only in their destination consoles.
