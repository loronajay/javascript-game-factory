import { isFinished } from './player.js';

// ─── Outcomes ─────────────────────────────────────────────────────────────────
const OUTCOMES = {
  REUNION:   'reunion',   // both sides finished — lovers reunite
  PARTIAL:   'partial',   // one side finished — no reunion, loser's score forfeited
  GAME_OVER: 'game_over', // neither finished
};

// ─── Run-end evaluation ───────────────────────────────────────────────────────
function evaluateRun(boy, girl) {
  const boyDone  = isFinished(boy);
  const girlDone = isFinished(girl);

  let outcome;
  if (boyDone && girlDone)       outcome = OUTCOMES.REUNION;
  else if (boyDone || girlDone)  outcome = OUTCOMES.PARTIAL;
  else                           outcome = OUTCOMES.GAME_OVER;

  const boyScore  = boyDone  ? boy.score  : 0;
  const girlScore = girlDone ? girl.score : 0;

  return {
    outcome,
    boyFinished:  boyDone,
    girlFinished: girlDone,
    boyScore,
    girlScore,
    totalScore: boyScore + girlScore,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export { evaluateRun, OUTCOMES };
