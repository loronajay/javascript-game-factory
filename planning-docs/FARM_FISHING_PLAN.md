# Farm Fishing — The Cove, the Fishing Skill, and Individual Fish

**Status:** Slices 1–6 shipped 2026-09-28, and slice 7's cooking, orders, barter trading and trophy mounts the same day (see `planning-docs/CHANGELOG.md`). Still to do: pond release (planned as a fish pack you can buy), fish on the Exchange Board, and slice 8.
**Scope:** `/farm/` family. There's a new shared hub at `/farm/cove/`, reached through a new north gate in the Market Square. It gets a fishing minigame, a server-minted fish inventory, a Fishing skill, and ways to spend what you catch.
**Assets:** `farm/assets/fishing/`, from Quaternius's Ultimate Fish pack. It's **CC0** (`License.txt`), so it can be used commercially and redistributed with no attribution required.

---

## 0. Where the build differs from this plan

- **Fishing lives beside the farm, not in the farm document.** Tackle and the Fishing record are a `farm_anglers` row (migration 056), so a cast never carries or locks a whole farm and the farm's save guard is untouched. Fishing needs a signed-in account, not a farm.
- **The rod gates changed**: Bamboo 5, Carbon 12, Gilded 25, Pro 40, and the Deep opens at Fishing 15, not 30. The rods matter for **line strength**: the stick cannot hold a shark.
- **Fish have standing prices, not day prices.** Values are the draft's "a little more than crops": commons 2–4, uncommons 6–9, rares 16–25, epics 48–75 and legendaries 220–300 tickets at average weight, with casts capped at 150 an hour.
- **Catch announcements are the angler's own chat line** ("🎣 landed a 9.4 kg Trophy Koi!"), so the presence bridge needed no change. Other players see "reeling one in!" on the angler's name tag, but not their rod.
- **The spit ends in a lighthouse** at z −23, with open sea wrapping round it past −26.

## 1. Goals

1. **Another reason to walk out of the gate.** Players go Farm → Market Square → Cove, and each place is shared and social. The Cove should be where people hang out: docks, benches, a campfire, chat, and catches announced out loud.
2. **Every fish is a specimen, not a count.** Two Koi aren't interchangeable. Each catch has its own weight, length, size class, grade and (rarely) a colour variant. You can see those differences in 3D, and they change what the fish is worth. "My 9.4 kg Trophy Koi" is something to show off, trade, or mount on the farm wall.
3. **A minigame that's skill-first.** It should feel like fishing (cast, wait, strike, fight, net) and not like a slot machine with an animation on top.
4. **Server-authoritative from day one**, following the pattern the harvest/chop/carpentry work already set. **The game decides whether you land the fish and how cleanly. The server decides which fish it is and how big.**
5. **Fish plug into the systems that already exist:** selling (day prices), the Kitchen (fish dishes), the Order Board, barter trading, the Exchange Board, farm decor (trophy mounts), and the farm pond (release a live catch into it).

---

## 2. What's in the pack

| Kind | Count | Notes |
|---|---|---|
| Fish | 35 | Anglerfish, ArmoredCatfish, Betta, BlackLionFish, Blobfish, BlueGoldfish, BlueTang, ButterflyFish, CardinalFish, Clownfish, CoralGrouper, Cowfish, Flatfish, FlowerHorn, GoblinShark, Goldfish, Humphead, Koi, Lionfish, MandarinFish, MoorishIdol, ParrotFish, Piranha, Puffer, RedSnapper, RoyalGramma, Shark, Sunfish, Swordfish, Tang, Tetra, Tuna, Turbot, YellowTang, ZebraClownFish |
| Rods | 5 | `FishingRod_Lvl1..5`. The progression is already drawn: stick, then cane, then carbon, then gold, then a pro rod with a reel |
| Lures | 6 | `Lure_1..6`, painted crankbaits with treble hooks |
| Bait | 1 | `Worm` |
| Boat | 1 | Rowing boat |
| Docks | 4 | `Dock_Long`, `Dock_Long_NoRope`, `Dock_Wide`, `Dock_Stairs` |

Formats are `.blend`, `.fbx` and `.obj/.mtl`. The repo only loads glTF (`js/vendor/loaders/GLTFLoader.js`). Materials are flat colours, with no textures.

**The fish FBX files have animation stacks** (probably a swim cycle, which Gobkit's animals also have). The rods, lures, docks and boat are static.

**Pipeline:** Blender 5.1 is on PATH. A one-off script (`farm/assets/fishing/tools/convert.py`, run with `blender -b -P`) opens each `.blend` and exports `farm/assets/fishing/glb/<id>.glb` with its animation. After that, only the GLBs get committed, plus `License.txt` and `Preview.jpg`. The Blends/FBX/OBJ folders total about 52 MB and stay out of git (see §12). A CI test checks that every catalog row names a GLB that exists, the same guard the jukebox has.

---

## 3. The place: the Cove (`/farm/cove/`)

- **Getting there:** the Market Square's north wall is split into two runs with a `decor.fence.gate` row (`market-gate-cove`) between them. The `farm-gateway.mts` rule already works for any perimeter gate. What changes is that the market has to map **which** gate leads **where**, keyed by instance id (today every gateway means "home"). The Cove has a south gate back to the square. A signpost at each gate names where it goes.
- **Built like the square:** constant decor rows on `createFarmWorld`, plus the farm walker/body, plus presence on the existing bridge under room id `farm:cove`. That means chat, emotes and visitors come for free, and the server doesn't change.
- **The water: a Cove** (decided 2026-09-28). A walkable spit of land splits the field into two waters, read from one pure profile (`js/farm-cove.mts`, the cove's version of `farm-pond.mts`):
  - **The Lagoon** (freshwater, west): reeds, lily pads and a little stone bridge. It's calm, shallow and near the shore. Koi, Goldfish, BlueGoldfish, Betta, Tetra, Piranha, ArmoredCatfish, FlowerHorn.
  - **The Reef Shelf** (sea side, east, mid-water): reached from the dock ends. Tangs, Clownfish, Butterfly, Moorish Idol, Parrot, Grouper, Lionfish and the rest of the reef crowd.
  - **The Deep** (sea side, past the long dock's end): a dark drop-off where the water turns navy. You reach it with a strong cast from the long dock, or later by boat. Tuna, Swordfish, Sunfish, Blobfish, Anglerfish, Goblin Shark, Shark.
  - The sea side opens to a horizon (the countryside scenery's hills are swapped for open water and a lighthouse). The Lagoon stays pastoral. **A zone is a fish pool:** a fish never appears outside its zones.
- **Docks from the pack** are walkable platforms. `farm-body.mts` already supports standing on a platform, so a dock is a solid with a `top`.
- **Social furniture:** benches along the shore, a campfire ring (seats already work: E to sit), and lamps for evening.
- **Keepers:**
  - **Bait & Tackle**: rods, lures and bait.
  - **Fishmonger**: buys fish.
  - **The Cove Records board**: today's and all-time heaviest catch of every species, plus the name of whoever caught it.
- **Fish shadows are the targets** (decided 2026-09-28, see §5.0). Dark silhouettes move through the water, and you cast at one to try for it. Every player in the cove sees the same shadows in the same places.

---

## 4. Fish: species, rarity, and specimens

### 4.1 Species rarity (draft, open to tuning)

| Rarity | Pull weight | Species |
|---|---|---|
| Common | 55% | Goldfish, Tetra, CardinalFish, Flatfish, ButterflyFish, Tang, Cowfish, ArmoredCatfish |
| Uncommon | 27% | BlueGoldfish, Betta, Clownfish, YellowTang, BlueTang, RedSnapper, Turbot, Puffer, Piranha, RoyalGramma |
| Rare | 12% | Koi, ZebraClownFish, MoorishIdol, ParrotFish, Lionfish, CoralGrouper, FlowerHorn, Tuna |
| Epic | 5% | MandarinFish, BlackLionFish, Humphead, Swordfish, Sunfish, Blobfish |
| Legendary | 1% | Anglerfish, GoblinShark, Shark |

Each species row (`js/farm-catalog/fish.mts` ↔ `services/farm-fish-catalog.mts`, mirrored the way crops and trees already are) carries:

- `rarity` and `zones` (which waters it lives in)
- `weightKg: { min, avg, max }`: a Tetra runs 0.01 to 0.06 kg, a Shark 60 to 400 kg
- `lengthM` at average weight (also the model's scale reference)
- `fight`: a style (§5.3) and a base strength
- `baseValue` in tickets at average weight
- `bait`: what it prefers (worm, or a specific lure)
- optional `hours` (time of day) and `minLevel`

The Cove's zones (§3) are what make the pack's mix sensible. Each species row lists its zones (`lagoon`, `reef`, `deep`). Rarity weights apply **within** a zone's pool, so the Lagoon has its own Common-to-Legendary spread (its legendary might be a giant Golden-prone Koi or FlowerHorn) and so do the Reef and the Deep. The final rarity column above gets re-cut per zone once the catalog is written.

### 4.2 The specimen

Every catch is rolled **by the server** at bite time:

- **Weight:** a percentile `p` drawn from a bell-shaped curve with thin tails, mapped between `min`, `avg` and `max`. Most fish land near average. The extremes are rare.
- **Length** follows from weight by the cube law: `L = lengthM × (w / avg)^(1/3)`. **The model is drawn at that length**, so two Koi really do look different when held up, on the wall, or in the creel thumbnail.
- **Size class** comes from `p`: **Tiny** (<10%), **Small**, **Average**, **Large** (>80%), **Trophy** (>97%), **Record** (>99.7%). The class is a label for the weight. It isn't rolled separately.
- **Grade** comes from how the fish was landed (§5.4): **Poor / Normal / Fine / Perfect**. These are the same four words and the same price multipliers (×0.75 / 1 / 1.2 / 1.4) as crop quality, so `farm-quality.mts`'s vocabulary is reused.
- **Variant:** Normal, **Shiny** (1 in 256, an alternate palette using the pet-palette tint approach) or **Golden** (1 in 4096, a metallic tint).
- **Value** = `baseValue × (w/avg)^0.8 × grade × variant (×3 shiny, ×10 golden) × day price`. The exponent below 1 keeps a record fish valuable without letting one lucky catch buy the whole economy.

So "the same fish" can differ in four independent ways: weight/size class, grade, variant, and when/where it was caught (kept for records).

---

## 5. The minigame

The pure sim is `js/farm-fishing.mts`: 60 Hz, injected random, no THREE and no DOM, the same shape as `farm-chop.mts`. The view is `farm-fishing-view.mts`: the rod in first person, the line, the bobber, and a tension HUD.

### 5.0 Shadows (server-seeded, shared)
- **The server owns the schedule.** Time is cut into short windows (about 5 minutes). For each window and zone, the server derives a set of **shadow slots** from a secret seed. Each slot has a hidden species and specimen roll, a public **silhouette size** (S / M / L / XL, plus a visible **fin** for anything Epic or Legendary), and a public **path**: a centre, radius, speed and phase, so any client can animate it the same way.
- `GET /games/farm/fishing/shadows?window=<n>` returns only the public parts (slot id, zone, size, fin, path) for the current and next window. It's cached and the same for everyone. Clients draw the shadows from the path, so the whole cove sees one fish in one place with no socket traffic.
- **Seeing a shadow tells you its size, not its species.** A fin tells you it's worth the effort. Size roughly predicts the specimen's weight class, which is the point of casting at the big one.
- **Per-player catches.** Each player can hook each slot once. If someone else catches the fish you were circling, your copy is still there (it vanishes only on the catcher's screen), so nobody gets griefed out of a Legendary. The catch announcement (§10) still shows everyone that it happened.
- **Density** is tuned per zone: several Lagoon shadows at a time, fewer in the Deep, and a fin appears a few times an hour across the whole cove. Shadows despawn at window end by swimming off into deep water, never by popping.
- **Casting into open water with no shadow** still works as a **blind cast**, drawing from the zone's pool at Common/Uncommon-leaning odds, so fishing never stalls on an empty screen. Shadows are where the rare fish are.
- **Pure layer:** `js/farm-fish-shadows.mts` evaluates a path at a time and resolves "which shadow is this lure near" (a lure lands **within reach** of a shadow, and the shadow turns to it and comes in). The server's mirror runs the same function to check a cast's claimed slot was really there at that moment.

### 5.1 Cast
Hold to draw the rod back and release to cast. A power meter oscillates, so timing matters, and the mouse aims. Where the lure lands decides the **zone**, and whether it's **near a shadow**. Land too close and a shadow spooks and flees. Land within the reach ring ahead of it and it turns to take a look. Nibbles (§5.2) are the shadow nosing the bait. The Deep needs a near-full cast from the long dock's end with a rod rated for it. A bad release plops into the shallows.

### 5.2 Wait and strike
The bobber sits. **Nibbles** make small dips, and striking on one spooks the fish, so you reset. The **bite** is a hard pull with a short strike window. The window is tighter for rarer fish, and the audio and visual cue is the same for every fish. Strike late and the bait is stolen. Bait and lure change how long you wait and what the pool is weighted toward.

### 5.3 Fight
The core of it is a **line-tension gauge** with a green band:
- **Hold** to reel. That brings the fish in and raises tension.
- **Release** and the fish runs. It takes line and tension drops.
- **Over the top** and the line snaps. The fish is lost, and so is the lure if one was used.
- **Slack too long** and the fish throws the hook.
- **Steer:** the fish pulls left or right. Hold the rod against the pull (A/D) and it tires faster. Hold with it and it rests.
- **Stamina:** the fish tires as you keep it in the band. A tired fish can be reeled freely.

Fight styles change the rhythm (these are data on the species row):
- **Darter**: sudden short sprints
- **Diver**: long steady pulls downward
- **Thrasher**: jittery tension spikes
- **Sulker**: heavy and slow, with little pull but huge stamina
- **Leaper**: jumps. Press to "bow the rod" as it leaps, or tension spikes.

**Strength scales with the specimen's weight**, so a Trophy fish is a harder fight than an average one of the same species. The rod's line rating widens the band and raises the snap point, which is what makes rod upgrades matter.

### 5.4 Net
When the fish is at the boat or dock and tired, press once to net it inside a timing ring. **Grade** comes from the whole fight: time in the band, near-snaps, and the net timing. That gives Perfect, Fine, Normal or Poor.

### 5.5 Rules for fairness
- The minigame never touches species, weight or variant. Those were decided at the bite.
- A fish that gets away is gone. No retries on the same specimen.
- Escaping or snapping costs only time, bait and sometimes a lure. Nothing else is at stake.

---

## 6. Server authority

Same standing as `POST /games/farm/harvests` and the tree fellings.

1. `POST /games/farm/fishing/casts` takes `{ zone, slotId?, landedAt: {x, z}, window, rodId, baitOrLure }`. The server checks the player owns that gear, the zone is allowed at their level, and a bait is spent. With a `slotId`, it re-evaluates the shadow's path and checks the lure really landed within reach of it at that moment and that the player hasn't already caught that slot. It then takes the **slot's pre-rolled specimen**. Without a `slotId`, it's a blind cast and the server rolls from the zone pool. Either way it stores a **pending cast** (`farm_fish_casts`: the specimen, a bite time and an expiry), and returns only a **bite delay, fight style and strength**. The client doesn't learn the species until it's landed. A "something big…" hint from the strength is allowed.
2. `POST /games/farm/fishing/casts/:id/land` takes `{ outcome: landed|escaped, grade }`. The server checks the cast is its own, not expired, and not already settled, and that enough real time has passed for the bite plus a minimum fight time for that strength. It clamps the grade to what that time allows. Then it **mints the fish row** and awards Fishing XP, inside one transaction.
3. **Honest limit:** the client can always claim a perfect land. That's the same standing as the chop and carpentry games: the game decides **effort, never yield**. The worst a cheater gets is every fish at Perfect grade (×1.4), capped by the real-time fence on casts. That fence works like the ticket time budget and the nap bank: a minimum cast interval plus a daily soft cap.

**Storage** (migration 056):
- `farm_fish`: one row per specimen, with `id, player_id, species, weight_g, length_mm, grade, variant, zone, caught_at, state (creel|mounted|pond|sold|cooked|traded|released)`
- `farm_fish_casts`: pending, short-lived

Fishing skill and gear live on the farm document like the other skills. They're server-owned, and the save guard pins them.

---

## 7. Fishing skill and gear

- `skills.fishing` uses the same RuneScape curve as `farm-skills.mts`. XP = species rarity × `(w/avg)^0.5` × a grade bonus. Escaping gives a small amount of XP so a hard fight is never a total loss.
- **Level gates:**

  | Level | Unlocks |
  |---|---|
  | 1 | Stick rod, shallows, worm |
  | 5 | Cane rod, Shelf zone |
  | 15 | Carbon rod |
  | 30 | Gold rod, the Deep |
  | 50 | Pro rod |
  | later | Boat |

  Lures unlock across the same range.
- **Bait & Tackle** sells rods (a permanent tier, bought once), lures (reusable, lost on a snap) and worms (a consumable, cheap stack). **Worms could also be dug from the farm's compost** as a tie-in with the harvest plan's compost, if wanted.
- Each lure tilts the pool toward some species and rarities. Six lures against 35 fish means each lure leans toward a group of five or six, not one fish.

---

## 8. Fish inventory (the Creel) and the Fishdex

- **The Creel** is a panel (F) listing every fish in `state=creel`. Each row has a real thumbnail drawn **at the specimen's scale** (the offscreen WebGL thumbnail pattern), plus species, weight, length, size class badge, grade, a shiny/golden mark, rarity colour and current value. It sorts by value/weight/newest/rarity and filters by species and rarity.
  - **Lock** a fish to protect it from bulk sale.
  - **Sell all unlocked commons** is one button.
- **Capacity:** 40 to start. A **Cooler** (bought, on the farm) raises it. A full creel means you sell, cook or release before you can keep fishing, which keeps the table bounded.
- **The Fishdex** shows 35 species, your personal best weight for each, whether you've found its shiny and golden variants, and its first catch date. Undiscovered species show as silhouettes. This is where the collecting happens, and it's a natural place for server-awarded achievements: first catch, every Common, a Legendary, a Record, a Shiny, a full dex.

---

## 9. What fish are for

| Use | Where | Notes |
|---|---|---|
| **Sell** | Fishmonger at the Cove | Server-priced by the specimen formula × day price (reuses `farm-market-day`) |
| **Cook** | Farm Kitchen / Market Kitchen | New fish recipes. A recipe asks for a species or a rarity, and auto-picks the lowest-value matching fish unless you choose one. Grade feeds the dish's stars, like crops |
| **Orders** | Order Board | Tiers ask for "a Large Snapper", "any Rare fish", and so on |
| **Trade** | Market Square barter table | Needs the trade policy extended from stacks to **specimen ids** (`fish:<id>`) |
| **Exchange** | Exchange Board | Also by specimen. The price band is read from the specimen's own value, not the species value |
| **Mount** | Farm build mode | A trophy mount decor row pointing to a fish id (`state=mounted`). The plaque reads its weight and date. The fish is drawn at its real length, so size is the point of mounting it |
| **Release to pond** | Farm pond | A live catch becomes an ornamental swimmer in your farm pond, like a koi pond. It uses the existing swimmer sim and the pond's `water` habitat. It's cosmetic and has no care needs (§12) |
| **Release** | Anywhere | Gone, plus a small amount of XP. Clears space |

---

## 10. Social layer

- **Visible fishing:** presence already carries `activity`. When fishing, other players see a rod in the visitor's hands and a line to a bobber at the cast point (this needs `cast: {x, z}` on the pose). The name tag reads "Fishing" or "Reeling in!".
- **Catch announcements:** a Rare-or-better catch, any Trophy or Record size, and any shiny/golden fish post a system line to the Cove's chat, for example "**Jay** landed a 9.4 kg Trophy Koi ✨". Anyone near also sees the catch hoisted over the angler for a few seconds, like the emote card. This needs one bridge allowlist addition (a catch frame), which is the one change on the network repo.
- **Cove Records board:** today's heaviest fish per species (resets at UTC midnight like the Order Board) and all-time heaviest, read from `farm_fish`.
- **Later:** **Derbies**, admin-scheduled events such as "heaviest Tuna in 2 hours", using the existing events system, and **boat** co-op.

---

## 11. Slices

1. **Assets and catalog.** Blender → GLB conversion script, `farm-catalog/fish.mts` plus the server mirror, and a pure specimen roller (`farm-fish-specimen.mts`: weight/length/class/value). Tests cover the distribution shape, the cube-law length, and value monotonicity. A contact sheet of all 35 at average, Tiny and Record size.
2. **The Cove hub.** North gate in the Market Square, gateway-to-destination mapping, `/farm/cove/` page, cove profile (lagoon + sea), walkable docks, the shadow schedule (pure layer + `GET /shadows`, drawn but not yet catchable), presence/chat. Chips and signposts.
3. **The minigame, local.** Pure `farm-fishing.mts` (tests play whole fights with scripted inputs for every fight style, and a perfect player lands every species with every rod it's gated for) plus the view. It runs against a local roller so it can be felt before the server exists.
4. **Server.** Casts/land routes, migration 056, Fishing skill, creel panel, Fishmonger sale.
5. **Gear.** Bait & Tackle, rod tiers, lures, worms, level gates.
6. **Fishdex, achievements, Cove Records, catch announcements** (the bridge change).
7. **Tie-ins:** cooking recipes, orders, trophy mounts, pond release, trade/exchange by specimen.
8. **Later:** boat, derbies, weather and time-of-day bites, fishing in your own farm pond.

---

## 12. Decisions and open questions

**Decided 2026-09-28:**
- **One DB row per fish.** Specimens keep exact weight, grade and variant (`farm_fish`).
- **The Cove only in v1.** Fishing your own farm pond is a later slice.
- **Cove fiction.** Freshwater Lagoon, Reef Shelf and the Deep (§3).
- **Shadows you cast at.** They're server-seeded, shared, and caught per player (§5.0). Blind casts still work.

**Still open:**
1. **Page path and name.** `/farm/cove/` and "the Cove", or a proper name ("Kettle Cove", "Lantern Cove"…)?
2. **Pond release.** Should released fish be cosmetic-only swimmers, or pets with needs?
3. **Raw asset files.** Commit only the converted GLBs and delete or ignore the 52 MB of Blend/FBX/OBJ?
4. **Economy tuning.** Should fish pay about the same per hour as farming, or more, as the active activity versus the passive one? The draft assumes a little more per hour than crops, because fishing needs full attention.
