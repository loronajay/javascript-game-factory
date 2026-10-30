import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PET_GAME_AUDIO, petGameSoundCues, createPetGameAudio } from '../shared/audio.js';

test('supplied menu, race and brawl audio paths resolve to MP3 files', () => {
  const paths = [PET_GAME_AUDIO.menu];
  for (const game of ['barnyard-dash','pondside-push']) paths.push(PET_GAME_AUDIO[game].music,...Object.values(PET_GAME_AUDIO[game].effects));
  assert.equal(paths.length,7);
  for(const path of paths) {
    const data=readFileSync(new URL(path));
    assert.ok(data.length>1000,path);
    assert.ok(data.subarray(0,3).toString()==='ID3'||data[0]===255,path);
  }
});

test('jumps, bump attacks, contact and eliminations sound once on each transition',()=>{
  const state={countdown:0,jumping:true,bumping:true,impact:1,out:2};
  assert.deepEqual(petGameSoundCues({countdown:1,out:0},state),['go','jump','bump','impact','splash']);
  assert.deepEqual(petGameSoundCues(state,state),[]);
  assert.deepEqual(petGameSoundCues({countdown:3},{countdown:2}),['countdown']);
  assert.deepEqual(petGameSoundCues({out:2},{out:0}),[],'a new round is not another splash');
});

test('music switches between menus and matches; mute silences tracks and supplied effects',()=>{
  const originals=new Map(['window','document','Audio','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const created=[];
  let muteButton;
  class FakeAudio {
    constructor(src){this.src=src;this.played=0;this.paused=true;created.push(this);}
    play(){this.played++;this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
  }
  const window=new EventTarget(),document=new EventTarget();
  document.hidden=false;
  document.createElement=()=>Object.assign(new EventTarget(),{setAttribute(){},style:{}});
  document.querySelector=()=>({append(button){muteButton=button;}});
  Object.assign(globalThis,{window,document,Audio:FakeAudio,localStorage:{getItem(){return null;},setItem(){}}});
  try {
    const audio=createPetGameAudio({game:'pondside-push'});
    const byName=name=>created.find(item=>item.src.endsWith(name));
    assert.ok(created.every(item=>item.played===0),'no autoplay before a gesture');
    window.dispatchEvent(new Event('pointerdown'));
    assert.equal(byName('pet-minigame-menu.mp3').paused,false);
    audio.setMenuActive(false);
    assert.equal(byName('pet-minigame-menu.mp3').paused,true);
    assert.equal(byName('pondside-push.mp3').paused,false);
    audio.observe({bumping:true,impact:1,out:1});
    for(const name of ['bump.mp3','push.mp3','splash.mp3'])assert.equal(byName(name).played,1);
    audio.observe({bumping:true,impact:1,out:1});
    assert.equal(byName('bump.mp3').played,1);
    muteButton.dispatchEvent(new Event('click'));
    assert.ok(created.every(item=>item.paused));
    audio.reset();audio.observe({bumping:true,impact:1,out:1});
    assert.equal(byName('bump.mp3').played,1,'muted effects do not play');
    audio.setMenuActive(true);
    muteButton.dispatchEvent(new Event('click'));
    assert.equal(byName('pet-minigame-menu.mp3').paused,false);
    assert.equal(byName('pondside-push.mp3').paused,true);
    document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    assert.ok(created.every(item=>item.paused));
    document.hidden=false;
    window.dispatchEvent(Object.assign(new Event('pagehide'),{persisted:true}));
    window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));
    assert.equal(byName('pet-minigame-menu.mp3').paused,false,'Back navigation restores menu music');
    window.dispatchEvent(new Event('pagehide'));
  } finally {
    for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});
