// Development-only view of the production renderer. No match, account, saved
// lane, or progression writes. Native controls let visual QA inspect each view.
import { Bowling3dRenderer } from '../bowl3d/renderer.mjs';
import { HEAD_Z, worldZ } from '../bowl3d/geometry.mjs';
import { DefaultLoadingManager } from '../bowl3d/vendor/three.module.min.js';

const house=document.querySelector('#house'),camera=document.querySelector('#camera');
for(const lane of window.YamLaneCore.LANES) house.add(new Option(lane.name,lane.slug));
const renderer=new Bowling3dRenderer({ canvas:document.querySelector('canvas'),classicRenderer:{assets:{character:[]}},
  physics:window.YamPhysics,laneCore:window.YamLaneCore,effects:window.YamEffects,balls:window.YamBallCore.BALLS });
renderer.bowler.visible=false;
const state={ phase:'ready',liveShot:{position:0,aim:0,hook:0,power:.6,release:0,ballIndex:0},
  pins:Array.from({length:10},(_,i)=>({id:i+1,standing:true})) };
let cycles=0,needsRender=true;
DefaultLoadingManager.onLoad=()=>{needsRender=true;};
window.addEventListener('resize',()=>{needsRender=true;});
function selectHouse() {
  needsRender=true;
  const lane=window.YamLaneCore.getLane(house.value);
  document.querySelector('img').src=`../${lane.src}`;
  document.querySelector('img').alt=`${lane.name} 2D reference`;
}
house.addEventListener('change',selectHouse);selectHouse();
camera.addEventListener('change',()=>{
  needsRender=true;
  const z=camera.value==='deck'?HEAD_Z+19:camera.value==='midway'?-28:18.5;
  renderer.camera.position.set(0,camera.value==='approach'?7.6:6.6,z);
  renderer.camera.lookAt(0,.8,camera.value==='approach'?worldZ(.2):z-26);
});
document.querySelector('#cycle').addEventListener('click',()=>{
  // Exercise repeated changes using the real GPU; memory counters are visible.
  for(let i=0;i<18;i++) {
    const lane=window.YamLaneCore.LANES[i%9];
    renderer.render(state,null,{laneSlug:lane.slug});
  }
  cycles+=2;
  needsRender=true;
});
function draw() {
  if(needsRender) {
    renderer.render(state,null,{laneSlug:house.value});needsRender=false;
    const {render,memory}=renderer.gpu.info;
    document.querySelector('#status').textContent=`${window.YamLaneCore.getLane(house.value).name} · ${camera.selectedOptions[0].text} · ${render.calls} draw calls · ${memory.textures} textures · ${memory.geometries} geometries · ${cycles} full cycles`;
  }
  requestAnimationFrame(draw);
}
draw();
