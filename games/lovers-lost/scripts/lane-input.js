import {
  nextActionForSide,
  processAction, resolveContactAction,
  startJump, summarizeObstacleOutcome,
} from './game-tick.js';
import { sanitizeResolvedOutcome } from './lane-snapshot.js';

const ACTION_DURATION = 18;
const HIT_DURATION    = 30;

export function createLaneInputHandler(inp, renderer, sounds) {
  return function handleSideInput(side, gs, boyAnim, girlAnim) {
    const player = side === 'boy' ? gs.boy : gs.girl;
    if (player.state === 'finished') return { gs, boyAnim, girlAnim, frameResolved: [] };

    const anim = side === 'boy' ? boyAnim : girlAnim;
    let interacted = false;
    const frameResolved = [];

    function applyResolvedResult(playerBefore, result, frontObs) {
      const outcome = summarizeObstacleOutcome(playerBefore, result, frontObs);
      if (side === 'boy') gs = { ...gs, boy: result.player,  boyObstacles: result.obstacles };
      else                gs = { ...gs, girl: result.player, girlObstacles: result.obstacles };

      if (outcome.feedback)    renderer.addOutcomeEffect(side, outcome.feedback, outcome.effectType);
      if (outcome.linger)      renderer.addTrailObstacle(side, frontObs);
      if (outcome.goblinDeath) {
        renderer.addDyingGoblin(side, frontObs, playerBefore.distance);
        sounds.play('sword-success'); sounds.play('goblin-death');
      }
      if (outcome.feedback === 'good' || outcome.feedback === 'perfect') {
        if (frontObs && frontObs.type === 'bird')      sounds.play('bird');
        if (frontObs && frontObs.type === 'arrowwall') sounds.play('shield-success');
      }
      if (outcome.hit) { anim.state = 'hit'; anim.actionTick = 0; sounds.play('player-hit'); }
      if (outcome.consumed) frameResolved.push(sanitizeResolvedOutcome(outcome));
      return outcome;
    }

    const crouchHeld = inp.isHeld(side, 'crouch');
    const enteringHeldCrouch = crouchHeld && anim.state !== 'crouch';
    if (crouchHeld && anim.state !== 'hit') {
      anim.state = 'crouch';
      if (enteringHeldCrouch) { anim.actionTick = 0; sounds.play('crouch'); }
    }

    if (side === 'boy') {
      const wasJumping = crouchHeld && gs.boy.state === 'jumping';
      gs = { ...gs, boy: { ...gs.boy, state: crouchHeld ? 'crouching' : (gs.boy.state === 'crouching' ? 'running' : gs.boy.state), ...(wasJumping ? { jumpY: 0, jumpVY: 0, jumpStartDistance: null } : {}) } };
    } else {
      const wasJumping = crouchHeld && gs.girl.state === 'jumping';
      gs = { ...gs, girl: { ...gs.girl, state: crouchHeld ? 'crouching' : (gs.girl.state === 'crouching' ? 'running' : gs.girl.state), ...(wasJumping ? { jumpY: 0, jumpVY: 0, jumpStartDistance: null } : {}) } };
    }

    const action = crouchHeld ? null : nextActionForSide(inp, side);
    if (action) {
      if (action === 'jump'   && inp.isPressed(side, 'jump'))   sounds.play('jump');
      if (action === 'attack' && inp.isPressed(side, 'attack')) sounds.play('sword');
      if (action === 'block'  && inp.isPressed(side, 'block'))  sounds.play('shield');

      const currentPlayer    = side === 'boy' ? gs.boy  : gs.girl;
      const currentObstacles = side === 'boy' ? gs.boyObstacles : gs.girlObstacles;
      const frontObs  = currentObstacles[0];
      const result    = processAction(currentPlayer, currentObstacles, action);
      const outcome   = applyResolvedResult(currentPlayer, result, frontObs);
      interacted = interacted || outcome.consumed;

      if (!outcome.hit && action !== 'jump') { anim.state = action; anim.actionTick = 0; }
      if (action === 'jump') {
        const updated = startJump(side === 'boy' ? gs.boy : gs.girl);
        if (side === 'boy') gs = { ...gs, boy: updated };
        else                gs = { ...gs, girl: updated };
      }
    }

    if (!interacted) {
      const currentPlayer    = side === 'boy' ? gs.boy  : gs.girl;
      const currentObstacles = side === 'boy' ? gs.boyObstacles : gs.girlObstacles;
      const frontObs  = currentObstacles[0];
      const contactResult = resolveContactAction(currentPlayer, currentObstacles, anim);
      if (contactResult.action) applyResolvedResult(currentPlayer, contactResult, frontObs);
    }

    if (anim.state === 'crouch' && !crouchHeld) { anim.state = 'running'; anim.actionTick = 0; }

    if (anim.state === 'attack' || anim.state === 'hit' || anim.state === 'block') {
      anim.actionTick++;
      const dur = anim.state === 'hit' ? HIT_DURATION : ACTION_DURATION;
      if (anim.actionTick >= dur) { anim.state = 'running'; anim.actionTick = 0; }
    }

    return { gs, boyAnim, girlAnim, frameResolved };
  };
}
