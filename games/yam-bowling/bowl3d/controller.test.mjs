import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBowlingMode } from './controller.mjs';
import { matchUses3d } from './mode.mjs';

test('online style comes from the authoritative match, never the local preference', () => {
  assert.equal(matchUses3d({ onlineMatch: true, match: { bowlingStyle: '3d', playType: 'online' } }), true);
  assert.equal(matchUses3d({ onlineMatch: true, setup: { bowlingStyle: '3d' }, match: { playType: 'online' } }), false);
});

test('online engine preparation is shared, lazy and retryable without starting a local match', async () => {
  let attempts = 0;
  const h = harness(async () => { if (++attempts === 1) throw new Error('offline'); return { renderer: {}, physics: {}, cpu: {} }; });
  await h.mode.prepare('arcade');
  assert.equal(attempts, 0);
  await assert.rejects(h.mode.prepare('3d'), /offline/);
  await Promise.all([h.mode.prepare('3d'), h.mode.prepare('3d')]);
  assert.equal(attempts, 2);
});

function harness(loadEngine) {
  const nodes=new Map();
  const get=id=>{ if(!nodes.has(id)) nodes.set(id,{ hidden:false,disabled:false,textContent:'',addEventListener(){} }); return nodes.get(id); };
  const session={setup:{bowlingStyle:'3d'}};
  let calls=0;
  const classicRenderer={canvas:{},ctx:{},render(){calls++;}};
  const mode=createBowlingMode({session,classicRenderer,physics:{},cpu:{},getElement:get,loadEngine});
  return {mode,session,get,classicCalls:()=>calls};
}
test('3D loads on demand once and starts only after the engine is ready', async()=>{
  let loads=0, starts=0;
  const h=harness(async()=>{loads++;return {physics:{fullLaneSimulation:true},cpu:{},renderer:{}};});
  assert.equal(loads,0);
  await h.mode.start(()=>{starts++;});
  await h.mode.start(()=>{starts++;});
  assert.equal(loads,1); assert.equal(starts,2); assert.equal(h.get('start-match').disabled,false);
});
test('a failed 3D load remains in setup and can be retried',async()=>{
  let starts=0,attempts=0;
  const h=harness(async()=>{if(++attempts===1) throw new Error('WebGL unavailable');return {renderer:{},physics:{},cpu:{}};});
  await h.mode.start(()=>starts++);
  assert.equal(starts,0); assert.match(h.get('bowling-style-status').textContent,/could not start/i);
  assert.equal(h.get('start-match').disabled,false);
  await h.mode.start(()=>starts++); assert.equal(starts,1);
});
test('leaving setup during loading cancels the pending start',async()=>{
  let finish; let starts=0;
  const h=harness(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.mode.start(()=>starts++);
  h.get('setup-screen').hidden=true;
  finish({renderer:{},physics:{},cpu:{}});
  await pending; assert.equal(starts,0);
});
test('an arcade match never loads or invokes the 3D engine',async()=>{
  const h=harness(()=>{throw new Error('must not load');});
  h.session.setup.bowlingStyle='arcade';
  let starts=0; await h.mode.start(()=>starts++);
  h.mode.renderer.render({},{});
  assert.equal(starts,1); assert.equal(h.classicCalls(),1);
});
