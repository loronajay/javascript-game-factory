# JavaScript Game Factory — Canon Badge Batch 1 Scope

## Scope Boundary

This badge batch is for the JavaScript Game Factory platform only.

Badges are cosmetic identity and achievement markers attached to JavaScript Game Factory player profiles. They are platform-owned records, not game-owned records.


The first badge batch prioritizes badges that can be safely granted manually without deeper automation infrastructure.

## Platform Ownership Rule

The JavaScript Game Factory platform owns:

- badge definitions
- player badge ownership records
- profile badge display
- featured badge ordering
- manual/admin badge grants
- badge revocation
- future automated eligibility checks

Games may eventually report achievement events into the platform, but games must not directly grant badges.

The frontend/client must never directly award badges.

Allowed future automated flow:

1. A user performs an action.
2. The client or game reports a platform event if needed.
3. The backend validates the event and eligibility.
4. The backend grants the badge if requirements are met.
5. The profile UI renders the resulting owned badge.

Manual/admin badges skip event validation, but must still be written through a controlled backend/admin path.

## Badge Implementation Tiers

### Tier 1 — Canon / Manual-Grant Ready

These badges can be locked now because eligibility is controlled by the platform owner/admin.

They do not require automated friend counters, ranking snapshots, score validation, game telemetry, season systems, or transaction systems.

### Tier 2 — Canon Concept / Deferred Implementation

These badges are reasonable future badges, but implementation should wait until the related platform infrastructure exists.

Examples:

- friend count badges
- leaderboard badges
- ranking badges
- high ladder placement badges
- game-specific challenge badges
- Merchant Hub badges

### Tier 3 — Draft Ideas Only

These are not canon yet. They should not be implemented or documented as final.

## Batch 1 Canon Badges

Batch 1 contains only manual/custom/legacy badges.

1. OG Triple-OG
2. OG
3. Poop Queen
4. Dewky
5. Alpha Tester
6. Bug Hunter
7. First Supporter

## Canon Badge Definitions

### 1. OG Triple-OG

Slug: `og-triple-og`

Category: Legacy / Founder

Grant Mode: Manual

Eligibility:

Users who had an active JavaScript Game Factory platform profile before the official public launch.

Description:

“Here before the doors officially opened. A pre-launch JavaScript Game Factory original.”

Implementation Notes:

- This is the highest-priority early-user badge.
- This badge is not earnable after official launch.
- This badge should be granted manually by the platform owner/admin.
- This badge should not be automatically inferred only from account creation timestamp unless the backend has reliable pre-launch profile records.
- This badge is cosmetic only and does not imply staff, moderation authority, merchant verification, or platform permissions.

Status:

Canon for Batch 1.

### 2. OG

Slug: `og`

Category: Legacy / Launch

Grant Mode: Manual initially; automated eligibility may be added later if launch-window records are reliable.

Eligibility:

Users who join JavaScript Game Factory during the first official public launch week.

Description:

“Joined during JavaScript Game Factory’s first official launch week.”

Implementation Notes:

- This badge is only earnable during the first official public launch week.
- The launch window should be recorded as explicit start/end timestamps before public release.
- Do not grant this to pre-launch users unless the platform owner chooses to grant both OG Triple-OG and OG.
- Default canon interpretation: pre-launch users receive OG Triple-OG, while launch-week users receive OG.
- This badge is cosmetic only and does not imply staff, moderation authority, merchant verification, or platform permissions.

Status:

Canon for Batch 1.

### 3. Poop Queen

Slug: `poop-queen`

Category: Custom / Personal

Grant Mode: Manual only

Eligibility:

Admin-designated user.

Description:

“This user is the Queen of Poop.”

Implementation Notes:

- This badge is cosmetic only.
- This badge should not imply staff, moderation authority, verified merchant status, or platform permissions.
- This badge should not be earnable through public gameplay, social actions, rankings, or automated counters.
- This badge should be granted only through the controlled admin/manual badge path.

Status:

Canon for Batch 1.

### 4. Dewky

Slug: `dewky`

Category: Custom / Personal

Grant Mode: Manual only

Eligibility:

Admin-designated user.

Description:

“This user is Dewky.”

Implementation Notes:

- This badge is cosmetic only.
- This badge should not imply staff, moderation authority, verified merchant status, or platform permissions.
- This badge should not be earnable through public gameplay, social actions, rankings, or automated counters.
- This badge should be granted only through the controlled admin/manual badge path.

Status:

Canon for Batch 1.

### 5. Alpha Tester

Slug: `alpha-tester`

Category: Legacy / Testing

Grant Mode: Manual

Eligibility:

Users who materially tested JavaScript Game Factory before or during early controlled testing.

Description:

“Helped test JavaScript Game Factory before the platform was ready for everyone.”

Implementation Notes:

- This badge is for meaningful early testing, not casual account creation.
- Grant manually only.
- Can overlap with OG Triple-OG when appropriate.
- This badge is cosmetic only and does not imply staff, moderation authority, merchant verification, or platform permissions.

Status:

Canon for Batch 1.

### 6. Bug Hunter

Slug: `bug-hunter`

Category: Contribution

Grant Mode: Manual

Eligibility:

Users who report useful bugs that help improve JavaScript Game Factory.

Description:

“Found bugs before they found everyone else.”

Implementation Notes:

- Grant manually after a useful bug report.
- Do not require a formal bug bounty system for Batch 1.
- Do not automate this until there is a real issue/report tracking flow.
- This badge is cosmetic only and does not imply staff, moderation authority, merchant verification, or platform permissions.

Status:

Canon for Batch 1.

### 7. First Supporter

Slug: `first-supporter`

Category: Legacy / Community

Grant Mode: Manual

Eligibility:

Early users, friends, or supporters who helped JavaScript Game Factory get off the ground in a meaningful way.

Description:

“Supported JavaScript Game Factory in its earliest days.”

Implementation Notes:

- This badge is intentionally broader than OG Triple-OG.
- It can be granted to people who contributed encouragement, testing, feedback, assets, promotion, or early participation.
- Grant manually only.
- This badge is cosmetic only and does not imply staff, moderation authority, merchant verification, or platform permissions.

Status:

Canon for Batch 1.

## Deferred Badge Concepts

The following badge concepts are valid future directions, but they should not be implemented in Batch 1.

### Friend Count Badges

Examples:

- First Friend
- Party Starter: 5 friends
- Connected: 25 friends
- Popular: 100 friends
- Big Deal: 1000 friends
- Platform Celebrity: 10,000 friends

Reason Deferred:

Requires reliable friendship tracking, abuse controls, and badge eligibility checks based on current or historical friend count.

### Game Score Badges

Examples:

- High Score Entry
- Score Chaser
- Game-specific score milestones

Reason Deferred:

Requires trusted score submission, leaderboard validation, anti-cheat assumptions, and game-specific scoring rules.

### Ranking / Ladder Badges

Examples:

- Top 100
- Top 25
- Top 10
- Season Champion

Reason Deferred:

Requires ranked seasons, ladder snapshots, placement history, and clear rules for whether badges represent current or historical rank.

### Game Achievement Badges

Examples:

- First Win
- Bot Breaker
- Hard Mode Clear
- Game-specific challenge badges

Reason Deferred:

Requires a platform-owned achievement event bridge and backend validation. Games should not directly grant badges from frontend code.

### Merchant / Vendor Badges

Examples:

- Verified Merchant
- Trusted Seller
- First Sale

Reason Deferred:

Requires Merchant Hub infrastructure, moderation/review policy, transaction tracking, and fraud controls.

## MVP Implementation Boundary

The first implementation pass should support only the manual badge foundation.

Required:

- badge definitions
- player/profile badge ownership
- admin/manual grant path
- revoke path
- profile badge rendering
- featured badge slots or display ordering

Do not build the full automation/rules engine in the first pass unless the existing JavaScript Game Factory platform already has a clean event system ready to use.

Do not invent new platform surfaces. Integrate with existing JavaScript Game Factory profile/account surfaces.
