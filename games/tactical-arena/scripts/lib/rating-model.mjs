// Bradley-Terry style rating fit for 4-unit squads.
//
// Model: a squad's strength is the SUM of its members' ratings, and
//   P(A beats B) = sigmoid(strength(A) - strength(B))
// so each unit's contribution is separated from whoever happened to be drafted next to
// it. A raw win rate cannot do that — it credits a unit for its teammates.
//
// Ratings are only identifiable up to a shared constant, so the fit re-centres on every
// pass: rating 0 always means "roster-average unit".
//
// The default hyperparameters are not guesses. They were selected by fitting synthetic
// matches generated FROM this same model with known true ratings, and picking the config
// that recovered those ratings with an unbiased slope. See tests/balance-estimator.test.js,
// which re-runs that recovery check:
//   l2=0.01   -> slope 0.67 (ordering right, magnitudes shrunk by a third)
//   l2=0.0002 -> slope 0.98 (magnitudes usable as stated)
// Ordering survives either way (r = 0.9985); the magnitudes do not, and the docs quote
// magnitudes, so the weaker penalty is the correct default.

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export const DEFAULT_FIT = Object.freeze({ iterations: 20000, lr: 2.0, l2: 0.0002 });

export function fitRatings(matches, roster, options = {}) {
  const { iterations, lr, l2 } = { ...DEFAULT_FIT, ...options };
  const index = new Map(roster.map((u, i) => [u, i]));
  const n = roster.length;
  const ratings = new Float64Array(n);

  // Pre-index every match once; the inner loop runs tens of thousands of times.
  const rows = matches.map((m) => ({
    a: m.squadA.map((u) => index.get(u)).filter((i) => i !== undefined),
    b: m.squadB.map((u) => index.get(u)).filter((i) => i !== undefined),
    // A draw is half a win for both sides. Dropping draws instead would bias the fit
    // against stall-prone walls, whose whole strategy is refusing to lose.
    y: m.outcome === "A" ? 1 : m.outcome === "B" ? 0 : 0.5
  }));

  for (let iter = 0; iter < iterations; iter += 1) {
    const grad = new Float64Array(n);
    for (const row of rows) {
      let strength = 0;
      for (const i of row.a) strength += ratings[i];
      for (const j of row.b) strength -= ratings[j];
      const err = row.y - sigmoid(strength);
      for (const i of row.a) grad[i] += err;
      for (const j of row.b) grad[j] -= err;
    }
    let mean = 0;
    for (let i = 0; i < n; i += 1) {
      ratings[i] += (lr * (grad[i] / rows.length)) - (lr * l2 * ratings[i]);
      mean += ratings[i];
    }
    mean /= n;
    for (let i = 0; i < n; i += 1) ratings[i] -= mean;
  }

  // Standard error from the diagonal of the observed Fisher information, so the docs can
  // say out loud which tier gaps the sample actually supports.
  const info = new Float64Array(n);
  for (const row of rows) {
    let strength = 0;
    for (const i of row.a) strength += ratings[i];
    for (const j of row.b) strength -= ratings[j];
    const p = sigmoid(strength);
    const w = p * (1 - p);
    for (const i of row.a) info[i] += w;
    for (const j of row.b) info[j] += w;
  }

  return roster.map((u, i) => ({
    unit: u,
    rating: ratings[i],
    stderr: info[i] > 0 ? 1 / Math.sqrt(info[i]) : Infinity
  }));
}

export function predictWinProbability(ratingsByUnit, squadA, squadB) {
  let s = 0;
  for (const u of squadA) s += ratingsByUnit[u] ?? 0;
  for (const u of squadB) s -= ratingsByUnit[u] ?? 0;
  return sigmoid(s);
}

// mulberry32 — small, fast, and reproducible. Used for squad sampling and by the
// estimator test. Deliberately not an LCG: the obvious `(s * 1103515245 + 12345) >>> 0`
// overflows float precision in JS and produces correlated draws, which silently
// manufactures fake "synergy" in any analysis built on top of it.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
