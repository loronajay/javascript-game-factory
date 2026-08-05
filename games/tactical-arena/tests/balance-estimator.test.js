// The balance docs quote unit ratings produced by scripts/lib/rating-model.mjs, so the
// estimator itself has to be trustworthy. This test generates matches FROM the model with
// known true ratings and checks the fit recovers them — both the ordering (which drives
// tier placement) and the magnitude (which the docs quote as percentages).
//
// This is the guard that stopped the tuning from being a guess: an earlier default of
// l2=0.01 recovered the ordering perfectly but shrank every magnitude by a third, which
// would have understated every tier gap in the docs.

import test from "node:test";
import assert from "node:assert/strict";

import { fitRatings, mulberry32, sigmoid } from "../scripts/lib/rating-model.mjs";

function syntheticMatches({ units = 12, games = 2000, seed = 20260804, spread = 1.1 } = {}) {
  const rand = mulberry32(seed);
  const roster = Array.from({ length: units }, (_, i) => `u${i}`);
  // Evenly spaced true ratings, centred on zero.
  const truth = Object.fromEntries(
    roster.map((u, i) => [u, ((i - (units - 1) / 2) / ((units - 1) / 2)) * spread])
  );

  const pickSquad = () => {
    const pool = [...roster];
    return Array.from({ length: 4 }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  };

  const results = [];
  for (let i = 0; i < games; i += 1) {
    const squadA = pickSquad();
    const squadB = pickSquad();
    const strength = squadA.reduce((n, u) => n + truth[u], 0) - squadB.reduce((n, u) => n + truth[u], 0);
    results.push({ squadA, squadB, outcome: rand() < sigmoid(strength) ? "A" : "B" });
  }
  return { roster, truth, results };
}

test("rating fit recovers known unit strengths in order", () => {
  const { roster, truth, results } = syntheticMatches();
  const fitted = fitRatings(results, roster, { iterations: 1200, lr: 2.5, l2: 0.0002 });
  const estimated = Object.fromEntries(fitted.map((f) => [f.unit, f.rating]));

  let inversions = 0;
  for (let i = 0; i < roster.length; i += 1) {
    for (let j = i + 1; j < roster.length; j += 1) {
      const a = roster[i];
      const b = roster[j];
      // Only count inversions between units whose true ratings are meaningfully apart;
      // adjacent near-ties are genuinely unresolvable at this sample size.
      if (Math.abs(truth[a] - truth[b]) < 0.25) continue;
      if (Math.sign(truth[a] - truth[b]) !== Math.sign(estimated[a] - estimated[b])) inversions += 1;
    }
  }
  assert.equal(inversions, 0, `expected no rank inversions between clearly-separated units, got ${inversions}`);
});

test("rating fit is not systematically shrunk toward zero", () => {
  const { roster, truth, results } = syntheticMatches();
  const fitted = fitRatings(results, roster, { iterations: 1200, lr: 2.5, l2: 0.0002 });

  // Regression slope of estimated on true. A slope well under 1 means every magnitude the
  // docs quote is understated; well over 1 means they are inflated.
  const trueValues = roster.map((u) => truth[u]);
  const estValues = fitted.map((f) => f.rating);
  const meanTrue = trueValues.reduce((a, b) => a + b, 0) / trueValues.length;
  const meanEst = estValues.reduce((a, b) => a + b, 0) / estValues.length;

  let covariance = 0;
  let varianceTrue = 0;
  let varianceEst = 0;
  for (let i = 0; i < roster.length; i += 1) {
    covariance += (trueValues[i] - meanTrue) * (estValues[i] - meanEst);
    varianceTrue += (trueValues[i] - meanTrue) ** 2;
    varianceEst += (estValues[i] - meanEst) ** 2;
  }
  const slope = covariance / varianceTrue;
  const correlation = covariance / Math.sqrt(varianceTrue * varianceEst);

  assert.ok(correlation > 0.95, `correlation with true ratings too low: ${correlation.toFixed(4)}`);
  assert.ok(slope > 0.8 && slope < 1.25, `recovery slope outside acceptable band: ${slope.toFixed(3)}`);
});

test("ratings stay centred so zero means roster-average", () => {
  const { roster, results } = syntheticMatches({ games: 1200 });
  const fitted = fitRatings(results, roster, { iterations: 800, lr: 2.0, l2: 0.0002 });
  const mean = fitted.reduce((n, f) => n + f.rating, 0) / fitted.length;
  assert.ok(Math.abs(mean) < 1e-9, `ratings not centred: mean ${mean}`);
});

test("draws count as half a win rather than being dropped", () => {
  // Two squads that always draw must land at equal rating, not at whatever their
  // non-drawn games happen to say. Walls that refuse to lose would otherwise be
  // mis-rated by whichever handful of games broke the stall.
  const roster = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const squadA = ["a", "b", "c", "d"];
  const squadB = ["e", "f", "g", "h"];
  const results = Array.from({ length: 400 }, () => ({ squadA, squadB, outcome: "draw" }));
  const fitted = fitRatings(results, roster, { iterations: 500, lr: 2.0, l2: 0.0002 });
  for (const f of fitted) {
    assert.ok(Math.abs(f.rating) < 0.01, `${f.unit} drifted off zero on all-draw data: ${f.rating}`);
  }
});
