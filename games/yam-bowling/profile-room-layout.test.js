const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("the desktop room keeps its backdrop visible through a restrained glass dashboard", () => {
  const css = fs.readFileSync(path.join(__dirname, "styles/profile.css"), "utf8");
  const screenRule = css.match(/\.profile-screen\s*\{([\s\S]*?)\}/)?.[1] || "";
  const roomRule = css.match(/\.profile-room\s*\{([\s\S]*?)\}/)?.[1] || "";
  const shadeRule = css.match(/\.profile-room-shade\s*\{([\s\S]*?)\}/)?.[1] || "";
  const cardRule = css.match(/(?:^|\n)\.profile-card\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(screenRule, /--profile-glass:\s*rgba\([^)]*,\s*\.1\d\)/, "the dashboard surface stays translucent");
  assert.match(cardRule, /background:\s*var\(--profile-glass\)/, "cards use the shared glass surface");
  assert.doesNotMatch(shadeRule, /rgba\([^)]*,\s*\.(?:8|9)\d*\)/, "the room-wide shade cannot become near-opaque");
  assert.match(roomRule, /grid-template-columns:\s*minmax\(360px,\s*1fr\)\s+minmax\(500px,\s*640px\)/, "the dashboard does not consume half of a wide room");
});
