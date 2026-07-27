# Tactical Arena on Google Play — Owner's Checklist

Everything **you** need to do, in order. Written 2026-07-27, after identity verification.

`HANDOFF.md` is the engineering doc; this one is the console/account work that only you can
do. Where a step needs code or assets, it says who does it.

**The one thing that matters most:** the closed test needs **12+ testers opted in for 14
continuous days** before you can even *request* production access. That clock is the long
pole — nothing else on this list takes 14 days. Start recruiting testers today, before the
build is perfect. Everything else can be fixed while the clock runs.

---

## Where things stand

| | |
| --- | --- |
| The app | Builds, installs, and plays on a real device |
| Purchases (client + server) | Built and tested; never yet run against real Google |
| Release signing | Wired; needs your keystore (step 1) |
| App icon | **Done** — the shield mark, generated at all five densities |
| Store listing icon (512×512) | **Done** — `store-listing/play-icon-512.png` |
| Feature graphic (1024×500) | **Done** — `store-listing/play-feature-graphic-1024x500.png` |
| Store descriptions | **Drafted** — `store-listing/DESCRIPTIONS.md`, yours to edit |
| Privacy policy | **Written** — `/privacy` on the site. Needs deploying and a working contact address |
| Screenshots | Not started — take these after your UI pass |
| Play Console app entry | Not created yet |

---

## Your critical path

1. [ ] Generate the upload keystore
2. [ ] Create the Google service account
3. [ ] Create the app in Play Console
4. [ ] Publish a privacy policy
5. [ ] Assemble the store listing
6. [ ] Fill the Data safety + content rating forms
7. [ ] First upload → Internal testing
8. [ ] Test on your own phone, including a real purchase
9. [ ] Create the 317 in-app products
10. [ ] Open the closed test and recruit 12+ testers ← **start this early**
11. [ ] Wait out 14 days, then request production

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

The page is written and lives at `privacy/index.html`, so it will be at
`https://jayarcade.com/privacy` once the site deploys. It covers what is collected, why, the
five processors (Railway, Cloudinary, Stripe, Google Play, Resend), what is public vs private,
retention, deletion, children, and security.

**Two things you must do before using it as your policy URL:**

1. **Read it.** It is a legal statement about your product, written from what the code does.
   If any of it is wrong, it needs to be wrong-free before it is public.
2. **Make `privacy@jayarcade.com` actually receive mail** — it is named four times as the
   contact for data requests, and a privacy contact that bounces is worse than none. Either
   set up the alias or swap the address for one that works.

One claim worth confirming: it says account deletion removes your profile, images, posts,
messages, friendships and gameplay records. `deleteAccountService` does exist, but it is worth
deleting a throwaway account and checking what actually disappears before you publish this.

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
- Users can request deletion — make sure this is actually true and documented in the policy
- Payments run through Stripe and Google Play; you do not store card details — true, and worth
  stating plainly

**Content rating** — answer the questionnaire. Tactical Arena is fantasy combat with no blood,
no real-world violence, no gambling. Expect roughly **Everyone 10+ / PEGI 7**.

One question deserves care: there **is** user-to-user interaction (friends, profiles, and the
shared factory social layer). Declare it. Under-declaring social features is a classic
rejection reason.

---

## 7. First upload → Internal testing

Internal testing is the fastest track: up to 100 testers, live within minutes, no full review.
It is how you get billing working on your own phone.

```powershell
cd mobile\tactical-arena
npm run release:check
npm run bundle:release -- -PtaVersionCode=1 -PtaVersionName=1.0
```

Upload `android\app\build\outputs\bundle\release\app-release.aab` to *Testing → Internal
testing → Create new release*.

Play will offer **Play App Signing** — accept it. It means Google holds the real signing key
and your `.jks` is only an upload key, which is the recoverable arrangement.

Then: *Testers* tab → create an email list → add your own Google account → save → copy the
**opt-in URL**.

⚠️ Every later upload needs a **higher** `versionCode`. It can never repeat and never go down.
Version 2 would be `-PtaVersionCode=2`.

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

### Purchases — needs step 7 first

Billing does **not** work from a sideloaded debug APK. Play only honours purchases for an app
it distributed. After the internal-testing upload:

1. Play Console → *Setup* → **License testing** → add your Google account.
2. Open the internal-testing **opt-in URL** on the phone, accept, install from Play.
3. Buy something in the shop.

As a licence tester you will see "Test card, always approves" and **will not be charged** — but
the entire real flow runs, including the server verification. That first purchase is the only
proof that the Google integration works, because it has never seen a real Google response.

**Watch the API logs during it.** If something is wrong, it shows up as
`play_verification_not_configured` (key missing/not propagated) or `purchase_not_found`
(package name or product id mismatch).

---

## 9. Create the 317 in-app products

Play removed CSV import in May 2025, so this is scripted.

```powershell
cd mobile\tactical-arena
npm run play:sync                                                    # dry run, no key needed
npm run play:sync -- --apply --key=play-service-account.json --only=ta.unit.monk   # prove one
npm run play:sync -- --apply --key=play-service-account.json         # then all 317
```

Products can only be created **after** a bundle has been uploaded (step 7). If the script
errors on a fresh app, that is why.

⚠️ **A Play product ID can be deactivated but never deleted or reused.** So before running the
full sync, settle anything that changes the *set* of products — adding, removing, or renaming a
unit or a skin. Price changes are fine at any time; just re-run the sync.

Your balance pass mostly does not affect this. The exception: unit USD prices are derived from
**star tier**, so re-starring a unit changes its price. There is now a test that fails when the
game and server disagree; when it does, update the server catalog and re-run this sync.

---

## 10. The closed test — start this early

*Testing → Closed testing → Create track.*

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

All four items previously offered are done: the privacy policy, the feature graphic, the
descriptions, and the duplicate-purchase hardening (a purchase of something you already own is
now refused **before** Google's payment sheet opens, so no money moves at all).

Still open, and each needs something from you:

- [ ] **Read the privacy policy** and make its contact address deliverable (step 4).
- [ ] **Screenshots** — best taken from your own device after the UI pass.
- [ ] **Refresh ownership when the shop opens.** The last piece of the duplicate-purchase
      work. A blocked purchase already corrects the catalog, but an owned item can still be
      *displayed* as buyable until you try it. This needs `shop.js`, which your other agent was
      editing at the time — tell me when that has settled and I will finish it.

I do **not** need: your keystore passwords, the service-account JSON, or your Play Console
login. Those stay with you.
