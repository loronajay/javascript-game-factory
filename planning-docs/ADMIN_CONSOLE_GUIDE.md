# Admin Console — User Guide

The operator surface for the arcade: announcements, the event calendar, how cabinets appear on the grid, moderation, and account actions.

This is the *how do I use it* doc. For why it was built the way it was, see the Admin Console entry in `CHANGELOG.md`.

---

## Where it is

**https://factory.jayarcade.com/admin/**

Once you're an admin, an **ADMIN** link also appears in the top-right of every platform page, next to Sign Out. That link is a convenience only — the console re-checks your access on the server for every single action, so nothing is protected by the link being hidden.

If you open the URL without admin access you get a plain refusal page. It tells you which problem you have:

| What it says | What it means |
|---|---|
| **Sign in required** | You're signed out or your session expired. Sign in again. |
| **Admin access required** | You're signed in, but this account isn't an admin. |

---

## First-time setup

Admin access is a flag on your account, seeded from an environment variable on Railway. **The account has to exist before it can be promoted**, so the order matters:

1. **Sign up on the site** with the email you want to be your admin account (or confirm you already have an account with it).
2. In **Railway → your platform-api service → Variables**, add:
   ```
   ADMIN_EMAILS=leojaylorona@gmail.com
   ```
   Comma-separate for more than one: `ADMIN_EMAILS=you@example.com,someone@example.com`
3. **Redeploy.** The promotion runs once at boot, right after database migrations.
4. Sign out and back in on the site, then open `/admin/`.

Two things about `ADMIN_EMAILS` that will save you confusion later:

- **It only ever grants.** Removing an address from the variable does *not* demote anyone. That's deliberate — a typo in an env var shouldn't be able to strip access from a live operator. To remove an admin, use the **Accounts** tab.
- **It only promotes accounts that already exist.** Adding an email nobody has signed up with does nothing, silently.

After the first admin exists, you never need the env var again — grant everyone else from the Accounts tab.

---

## The tabs

Each tab lives at its own URL (`/admin/#moderation`, `/admin/#bulletins`, and so on), so you can bookmark one and a page refresh keeps you where you were.

### Overview

Read-only dashboard. Open reports, how many bulletins exist vs. are published, upcoming events, suspended accounts, cabinet overrides, admin count. Start here to see if anything needs you.

### Bulletins — announcements

The list is on the left, the editor on the right. Click **Edit** on any row to load it, or **New** for a blank form.

| Field | Notes |
|---|---|
| **Title** | Required in practice — a blank one saves as "Untitled Bulletin". |
| **Slug** | The URL identity. **Leave it blank** and it's generated from the title. Only set it by hand if you need a specific link. Slugs must be unique; a collision says so. |
| **Summary** | The line shown on the board. Keep it short — 220 characters, trimmed past that. |
| **Body** | The full announcement. |
| **Attachment** | One image — a tournament flyer, a patch banner. PNG, JPEG, GIF, or WEBP. See below. |
| **Status** | `draft` (invisible), `published` (live), `archived` (pulled). |
| **Audience** | **Leave this on `public`** — see the caveat below. |
| **Publish date** | Blank + status `published` = live right now. Set a date to backdate or to control ordering. |
| **Pin** | Sticks it to the top of the board, above date ordering. |

Published bulletins appear at **/bulletins/**, newest first, pinned ones above everything.

**Attaching a flyer.** Click **Choose File** and pick the image. It uploads immediately — you'll see it appear in the form before you save, so you can tell you picked the right one. Then save the bulletin to keep it.

- **Posters are never cropped.** A portrait flyer stays portrait, letterboxed on a dark matte, with the frame sized to hug the poster rather than stranding it in a wide black band. Whatever's printed at the bottom of your flyer — date, venue, entry fees — stays readable on the board.
- Players can **click the image** to open the full-resolution original in a new tab, for anything too small to read on the card.
- **Remove image** clears it from the form only. The bulletin keeps its current image until you hit save, so a mis-click is undone by navigating away.
- Uploading is not saving. If you attach a flyer and then leave the tab without saving, the bulletin is unchanged.
- The image is hosted on Cloudinary and scaled down to 1200px on its long edge. Uploading a bigger file is fine — it's resized, not rejected.

> **Caveat — audience.** `friends` and `private` are stored but nothing reads them yet. The public board only shows `published` + `public`. A bulletin set to `friends` is invisible everywhere, exactly like a draft. Treat those two options as not-yet-built.

### Events — the calendar

Same list-and-editor shape as bulletins.

| Field | Notes |
|---|---|
| **Title / Slug / Summary / Body** | Same rules as bulletins. |
| **Starts / Ends** | Date and time pickers. |
| **Related cabinets** | Comma-separated **slugs**, e.g. `sumorai, tactical-arena`. Use the slug shown under each cabinet's name on the Cabinets tab, not the display name. |
| **Status** | `scheduled`, `live`, `completed`, `cancelled`. Cancelled events are hidden from the public calendar. |

Events appear at **/events/**, soonest first, and each has its own page at `/event/index.html?slug=<slug>`.

> **Worth knowing:** there is no Events link in the top nav. Players reach the calendar from the **See Events** button on the home page, or from a link you put in a bulletin. If you want events to get traffic, announce them in a bulletin too.

### Cabinets — how games appear on the grid

One card per cabinet, loaded live from each game's own `game.json`.

**This tab cannot change or break a game.** It only changes how the arcade grid *presents* one. The game's folder, files, and direct URL are untouched by everything here.

| Control | Effect |
|---|---|
| **Display title** | Overrides the grid card's name. |
| **Grid order** | Overrides its position. Lower sorts first. |
| **Tagline** | Overrides the card's one-liner. |
| **Status label** | Overrides the status text on the card. |
| **Hide from the grid** | Removes the card. The game still works at its direct URL. |
| **Feature this cabinet** | Sets the featured flag. |
| **Reset to game.json** | Deletes every override for that cabinet, restoring exactly how it shipped. |

**Every field's placeholder is the real value from `game.json`.** A blank field means "inherit" — so clearing a field restores the game's own value rather than blanking the card. Cabinets you've overridden show an **OVERRIDDEN** badge; hidden ones are dimmed with a dashed border.

If you ever want to undo everything on this tab, hit **Reset to game.json** on each overridden cabinet.

### Moderation — the report queue

Reports players have filed. The filter at the top right switches between `open` (default), `resolved`, `dismissed`, and `all`.

Each row shows what was reported, why, who reported it, who posted it, and any detail the reporter typed. Actions:

| Button | Effect |
|---|---|
| **Resolve** | Marks it handled. Use after you've acted. |
| **Dismiss** | Marks it as nothing to act on. |
| **Remove content** | **Permanently deletes the post/comment/photo for everyone.** Cannot be undone. Also auto-resolves any other open reports about the same item. |
| **Suspend author** | Suspends the poster for 7 days with a note that it came from the queue. |

Every destructive action asks you to confirm first.

> **Where reports come from:** players get a **Report** button on other people's posts on profile pages (it sits where the Delete button is on their own posts). They pick a reason — spam, harassment, hate, sexual, violence, impersonation, other. Filing the same report twice is a no-op, so the queue can't be flooded by one person hammering the button.
>
> Right now only **thoughts** have a Report button wired up. Photo and comment reporting exists on the backend but has no player-facing button yet, so those rows won't appear in practice.

### Accounts — suspensions and admins

**Left panel — suspensions.** Current suspensions with a **Lift suspension** button, plus a form to suspend someone directly. You need their **player ID**, which is the `id` in their profile URL:

```
factory.jayarcade.com/player/index.html?id=player-abc123
                                            ^^^^^^^^^^^^
```
Use the **Search** page to find someone, open their profile, and copy it from the address bar.

Suspensions are time-boxed — 1 to 3650 days, default 7 — so they expire on their own and you never have to remember to lift one.

**What a suspension actually does:** the account can still sign in and read everything. It cannot post, comment, react, share, message, upload, or play ranked. That split is deliberate: they need to be able to sign in to see that they've been suspended.

**Right panel — admins.** The roster, with **Revoke admin**, plus a form to grant admin by player ID. Two guardrails:

- You cannot revoke the **last** admin. If there's only one, the button is replaced by an "Only admin" badge.
- You cannot **suspend** an admin. Demote them first if that's genuinely what you want.

### Audit — who did what

Every state-changing admin action, newest first: who did it, what they did, and to what. This is the record that makes granting someone else admin access safe. Read-only.

---

## Common tasks

**Post an announcement**
Bulletins → **New** → title + summary + body → Status **Published** → leave the publish date blank → **Create bulletin**. It's live at /bulletins/ immediately.

**Announce a tournament with a flyer**
Bulletins → **New** → title (e.g. `Sactown Smackdown X`) → summary describing the event → **Choose File** and pick the flyer → wait for the preview → Status **Published** → tick **Pin to the top of the board** so it stays above older notices → **Create bulletin**. When the date and venue firm up, Edit the same bulletin and update the summary — the flyer stays attached.

**Draft something now, publish later**
Save it with Status **Draft**. When you're ready, Edit → switch to **Published** → save. Leave the publish date blank at that point so it stamps the moment you publish.

**Take a cabinet off the grid temporarily**
Cabinets → tick **Hide from the grid** on that cabinet → **Save**. To bring it back, untick and save, or hit **Reset to game.json**.

**Promote a new cabinet to the top of the grid**
Cabinets → set **Grid order** to `0` → **Save**. To go back to the game's own ordering, clear the field and save.

**Handle a report**
Moderation → read the detail → **Remove content** if it warrants it, then the report auto-resolves. If the behaviour is a pattern, **Suspend author** as well. If it's nothing, **Dismiss**.

**Give someone else admin access**
Find their profile, copy the `id` from the URL, then Accounts → right panel → paste → **Grant admin**. They'll see the ADMIN link on their next page load.

---

## Gotchas

**Nothing here is cached — but your own page is.** The console reloads a tab's data after every action, so what you see is what the server stored. If a slug looks different after saving, that's the server normalizing it, not a bug.

**Two tabs open at once will fight.** If you edit the same bulletin in two browser tabs, the second save wins. Deleting something in one tab makes the other say "That item no longer exists — it may have been deleted in another tab."

**Admin access is checked per request, not per session.** If someone revokes your admin while you have the console open, your next click returns a refusal rather than working until you sign out.

**An empty board is a real state.** If you unpublish every bulletin, /bulletins/ shows an empty board — it will *not* fall back to the old built-in demo announcements. Those only appear if the backend is unreachable entirely.

**Removing content is permanent.** There's no trash, no undo, and no restore. The confirm dialog is the only safety net.

---

## If something's wrong

| Symptom | Likely cause |
|---|---|
| ADMIN link never appears | Not promoted yet — check `ADMIN_EMAILS` spelling and that you redeployed *after* signing up. Sign out and back in. |
| Console says "Admin access required" | Signed in on a different account than the one in `ADMIN_EMAILS`. |
| "Could not reach the platform API" | Railway service is down or asleep. The public pages fall back to their built-in content; the console can't. |
| Bulletin saved but isn't on /bulletins/ | Status isn't `published`, or Audience isn't `public`. |
| Flyer previewed in the editor but isn't on the board | The bulletin wasn't saved after the upload. Uploading attaches; saving commits. |
| "That file isn't an image the arcade accepts" | Only PNG, JPEG, GIF, and WEBP. The check reads the file's actual bytes, so renaming a `.pdf` to `.png` won't get past it. |
| "Image hosting isn't configured on the server" | Cloudinary credentials are missing from the Railway environment. |
| Event isn't on /events/ | Status is `cancelled`. |
| Cabinet edit had no visible effect | Check you hit **Save** on that specific card — each cabinet is its own form. |
| Grid still shows a hidden cabinet | Hard-refresh the grid; the browser may have cached the page. |
