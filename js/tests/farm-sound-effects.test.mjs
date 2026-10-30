import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {FARM_EFFECTS,farmResultEffects,catchEffect} from '../farm-sound-effects.mjs';

test('every configured sound file exists and is an MP3 asset',()=>{
  for(const file of [...Object.values(FARM_EFFECTS),'../menus/pet-minigame-menu.mp3']) {
    const path=new URL(`../../farm/assets/sounds/effects/${file}`,import.meta.url);
    assert.ok(existsSync(path),file);
    const data=readFileSync(path);
    assert.ok(data.length>1000);
    assert.ok(data.subarray(0,3).toString()==='ID3' || data[0]===255,`${file}: MP3 header`);
  }
});
test('three-star cue belongs to successful cooking/crafting, not animal grades',()=>{
  assert.deepEqual(farmResultEffects({ok:true,stars:3,cooking:{level:1,levelBefore:1}}),['three-star']);
  assert.deepEqual(farmResultEffects({ok:true,stars:3,carpentry:{level:1,levelBefore:1}}),['three-star']);
  assert.deepEqual(farmResultEffects({ok:true,births:[{grade:3}]}),['breed-complete']);
  assert.deepEqual(farmResultEffects({ok:true,births:[{grade:5},{grade:2}]}),['five-star-animal-birth']);
});
test('failed and duplicate actions are quiet; level-up and perfect harvest cues reflect actual rewards',()=>{
  assert.deepEqual(farmResultEffects({ok:false,stars:3,cooking:{}}),[]);
  assert.deepEqual(farmResultEffects({ok:true,duplicate:true,stars:3,carpentry:{}}),[]);
  assert.deepEqual(farmResultEffects({ok:true,quantity:2,quality:'perfect',farming:{level:2,levelBefore:1}}),['perfect-harvest','level-up']);
  assert.deepEqual(farmResultEffects({ok:true,levelBefore:3,levelAfter:4}),['level-up']);
});
test('special fish choose shiny over big, then normal for ordinary catches',()=>{
  assert.equal(catchEffect({variant:'normal',sizeClass:'average'}),'normal-catch');
  assert.equal(catchEffect({variant:'normal',sizeClass:'large'}),'big-catch');
  assert.equal(catchEffect({variant:'normal',sizeClass:'record'}),'big-catch');
  assert.equal(catchEffect({variant:'shiny',sizeClass:'record'}),'shiny-catch');
  assert.equal(catchEffect({variant:'golden',sizeClass:'tiny'}),'shiny-catch');
});
