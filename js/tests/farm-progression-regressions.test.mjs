import test from 'node:test';
import assert from 'node:assert/strict';
import { addPet, createDefaultFarmLayout, normalizeFarmLayout, withProductionCheckpoint } from '../farm-layout.mjs';
import { applyOfflineAnimals } from '../farm-offline-animals.mjs';
import { offlineSpan } from '../farm-offline.mjs';
import { createPetProfile, findPetCare } from '../farm-pet-care.mjs';
import { advancePetLifecycle } from '../farm-pet-lifecycle.mjs';
import { growthStage } from '../farm-pet-growth.mjs';
import { breedingRestMinutes, breedingRefusal } from '../farm-pet-breeding.mjs';
import { farmBreedingRefusal } from '../../platform-api/src/services/farm-pet-breeding-policy.mjs';
import { companionCount, horseCount } from '../farm-resident-capacity.mjs';
import { boundAnimalMinutes } from '../../platform-api/src/services/farm-time-policy.mjs';
import { normalizeFarmGarage } from '../../platform-api/src/services/farm-loadout-catalog.mjs';
import { freeYoungPlaces, occupiedSpace } from '../farm-livestock-space.mjs';
import { freeYoungPlaces as serverFree, occupiedSpace as serverOccupied } from '../../platform-api/src/services/farm-livestock-space.mjs';
import { pickFarmLivestockHome } from '../../platform-api/src/services/farm-livestock-catalog.mjs';
import { serverRideProfile } from '../../platform-api/src/services/farm-horse-ride.mjs';
import { createRidingController } from '../farm-riding-controller.mjs';
import { horseStockLine } from '../farm-horse-stock.mjs';
import { rollFarmStockHorse, refreshFarmHorses, HORSE_REFRESH_COOLDOWN_MS } from '../../platform-api/src/db/farm-horses.mjs';
import { createRideState, stepRide, rideInputFromKeys, packRideInput } from '../farm-ride.mjs';
import { findDownsCourse, stepCourse } from '../downs-course.mjs';
import { downsSolids, downsJumps, DOWNS_WALKER_BOUNDS } from '../downs-scene.mjs';
import { downsGround, downsWaterDepth } from '../downs-terrain.mjs';
import { forwardOf } from '../farm-ride-geometry.mjs';
import { plausibleStart, replayRun } from '../../platform-api/src/riding-sim/downs-replay.mjs';

test('away animals use their own rate and leave crop time and nap bank alone', () => {
  const start=1800000000000;
  let farm=withProductionCheckpoint(addPet(createDefaultFarmLayout(),'pet.corgi','Dog',()=>0.5).layout,start);
  farm={...farm, settings:{awayGrowth:0,awayAnimals:0.1}};
  const next=applyOfflineAnimals(farm,start,start+3600000);
  const minutes=offlineSpan(start,start+3600000,0.1).farmMinutes;
  assert.equal(next.clock.animalMinutes,minutes);
  assert.equal(next.clock.farmMinutes,farm.clock.farmMinutes);
  assert.equal(next.clock.napBank,farm.clock.napBank);
  assert.deepEqual(next.agriculture,farm.agriculture);
  assert.equal(next.pets[0].profile.ageDays-farm.pets[0].profile.ageDays,minutes/1440);
  assert.ok(next.pets[0].profile.hunger<farm.pets[0].profile.hunger);
  const paused={...farm,settings:{awayGrowth:0.2,awayAnimals:0}};
  assert.equal(applyOfflineAnimals(paused,start,start+3600000),paused);
});

test('away time is capped, requires an entry checkpoint, and is bounded by stored settings on the server', () => {
  const start=1800000000000;
  const farm={...withProductionCheckpoint(createDefaultFarmLayout(),start),settings:{awayGrowth:0.2,awayAnimals:0.1}};
  const a=applyOfflineAnimals(farm,start,start+86400000),b=applyOfflineAnimals(farm,start,start+86400000*10);
  assert.equal(a.clock.animalMinutes,b.clock.animalMinutes);
  const fresh={...farm,clock:{...farm.clock,checkpointAt:0}};
  assert.equal(applyOfflineAnimals(fresh,start,start+3600000),fresh);
  assert.equal(boundAnimalMinutes(farm,1e9,3600),144);
  assert.equal(boundAnimalMinutes({...farm,settings:{awayAnimals:0}},1e9,3600),0);
  const claimed={...farm,clock:{...farm.clock,animalMinutes:1e9},horseStockRefreshedAt:start};
  const saved=normalizeFarmGarage(claimed,{currentGarage:farm,currentSavedAt:start,now:start+3600000});
  assert.equal(saved.clock.animalMinutes,144);
  assert.equal(saved.horseStockRefreshedAt,undefined,'ordinary saves cannot mint paddock refreshes');
});

test('pets are adults for most of their lives and legacy pets reach full size by adulthood', () => {
  const care=findPetCare('pet.corgi');
  assert.equal(growthStage(care.maxLifeDays*0.15,care.maxLifeDays).id,'adult');
  assert.equal(growthStage(care.maxLifeDays*0.89,care.maxLifeDays).id,'adult');
  assert.equal(growthStage(care.maxLifeDays*0.9,care.maxLifeDays).id,'elder');
  const pet={...createPetProfile('pet.corgi',()=>0.5),ageDays:care.maxLifeDays*0.15-1,size:{current:0.65,max:1.1,growthPerDay:0.001}};
  assert.equal(advancePetLifecycle(pet,'pet.corgi',1440).size.current,1.1);
});

test('only mothers rest after breeding, including males with legacy rest stamps', () => {
  const base=createPetProfile('pet.corgi',()=>0.5);
  const mother={instanceId:'mother',speciesId:'pet.corgi',name:'Mom',profile:{...base,gender:'female',ageDays:20,happiness:100},bredAt:0};
  const father={...mother,instanceId:'father',profile:{...mother.profile,gender:'male'},bredAt:10000};
  const readyMother={...mother,bredAt:0};
  assert.equal(breedingRestMinutes(father,10001),0);
  assert.ok(breedingRestMinutes({...mother,bredAt:10000},10001)>0);
  assert.equal(breedingRefusal(readyMother,father,10001,2,12),null);
  assert.equal(farmBreedingRefusal(readyMother,father,10001,2,12),null);
});

test('horses have separate capacity and survive a farm document round trip', () => {
  let farm=createDefaultFarmLayout();
  farm={...farm,onboarding:{status:'complete',introSeen:true}};
  for(let i=0;i<12;i++) {const result=addPet(farm,'pet.horse',`Horse ${i}`,()=>0.5);assert.equal(result.valid,true);farm=result.layout;}
  assert.equal(horseCount(farm.pets),12);
  assert.equal(companionCount(farm.pets),0);
  assert.equal(addPet(farm,'pet.horse','Too many',()=>0.5).valid,false);
  for(let i=0;i<12;i++){const result=addPet(farm,'pet.corgi',`Dog ${i}`,()=>0.5);assert.equal(result.valid,true);farm=result.layout;}
  assert.equal(farm.pets.length,24);
  assert.equal(normalizeFarmLayout(farm).pets.length,24);
  assert.equal(normalizeFarmGarage(farm).pets.length,24);
});

test('chickens take quarter pen space; pregnancies reserve compatible homes instead of every home', () => {
  const homes=[{id:'yard#pen',slots:2},{id:'house#coop',slots:6,species:['livestock.chicken']}];
  const herd=[{homeId:'yard#pen',speciesId:'livestock.cow'},...Array.from({length:2},()=>({homeId:'house#coop',speciesId:'livestock.chicken',pregnant:true}))];
  assert.equal(freeYoungPlaces(homes,herd,'livestock.cow'),1,'chicks fill the coop and pen fractions without blocking the remaining calf place when reservations fit');
  assert.equal(serverFree(homes,herd,'livestock.cow'),1);
});

test('mixed pen occupancy and arriving chickens agree with the server', () => {
  const homes=[{id:'yard#pen',slots:2}];
  const herd=Array.from({length:7},()=>({homeId:'yard#pen',speciesId:'livestock.chicken'}));
  assert.equal(occupiedSpace(homes,herd).get('yard#pen'),1.75);
  assert.deepEqual(occupiedSpace(homes,herd),serverOccupied(homes,herd));
  assert.equal(pickFarmLivestockHome(homes,herd,null,'livestock.chicken').id,'yard#pen');
  assert.equal(pickFarmLivestockHome(homes,herd,null,'livestock.cow'),null);
  assert.equal(freeYoungPlaces(homes,herd,'livestock.chicken'),1);
  assert.equal(serverFree(homes,herd,'livestock.chicken'),1);
});

test('horse performance uses its own experience and the mounted profile can refresh after training', () => {
  const horse={instanceId:'horse-1',speciesId:'pet.horse',profile:createPetProfile('pet.horse',()=>0.5)};
  assert.deepEqual(serverRideProfile(horse,1),serverRideProfile(horse,99));
  let profile=serverRideProfile(horse,1);
  const controller=createRidingController({pets:{find:()=>({instanceId:'horse-1',x:0,z:0,yaw:0,sizeMultiplier:1}),mount:()=>true,ride:()=>{},dismount:()=>{}},mode:'piloted',profile:()=>profile,world:()=>({bounds:{width:100,depth:100,wallInset:0},solids:[],jumps:[]}),canStand:()=>true,horseHeight:1.65});
  assert.equal(controller.mount('horse-1'),true);
  profile={...profile,gallopSpeed:profile.gallopSpeed+1,staminaMax:20};
  controller.refreshProfile();
  assert.equal(controller.profile().gallopSpeed,profile.gallopSpeed);
  assert.equal(controller.state().stamina,20);
  assert.equal(controller.state().x,0);
});

test('refreshed horse rolls agree between client and server', () => {
  for(const roll of [0,1800000000000]) {
    assert.deepEqual(horseStockLine(20000,1,roll).profile,rollFarmStockHorse(20000,1,roll));
  }
  assert.notDeepEqual(horseStockLine(20000,1,0).profile,horseStockLine(20000,1,1800000000000).profile);
});

test('completed gallops replay exactly before and after this horse earns experience and training',()=>{
  const horse={instanceId:'horse-1',speciesId:'pet.horse',profile:createPetProfile('pet.horse',()=>0.5)};
  const upgraded={...horse,profile:{...horse.profile,riding:{...horse.profile.riding,xp:2000,trained:{...horse.profile.riding.trained,speed:2,stamina:2}}}};
  for(const mount of [horse,upgraded]) {
    const profile=serverRideProfile(mount,1);
    const course=findDownsCourse('gallop');
    const forward=forwardOf(course.start.heading);
    const pose={x:course.start.x-forward.x,z:course.start.z-forward.z,heading:course.start.heading};
    let state=createRideState({...pose,y:downsGround(pose)},profile),run=null;
    const world={bounds:DOWNS_WALKER_BOUNDS,solids:downsSolids(),jumps:downsJumps(false),ground:downsGround,water:downsWaterDepth};
    const input=rideInputFromKeys(new Set(['KeyW','ShiftLeft']));
    for(let i=0;i<7200&&run?.phase!=='finished';i++) {
      const next=stepRide(state,input,profile,world,1/60,'piloted');
      run=stepCourse(run,state,next.state,packRideInput(input),next.events,c=>c.id==='gallop').run;
      state=next.state;
    }
    assert.equal(run?.phase,'finished');
    const start=plausibleStart('gallop',run.start,profile);
    assert.ok(start);
    const replay=replayRun('gallop',start,run.inputs,profile);
    assert.equal(replay.finished,true);
    assert.equal(replay.ticks,run.ticks);
    assert.equal(replay.faults,run.faults);
  }
});

test('paddock refresh enforces a server-side 24-hour cooldown and preserves the farm',async()=>{
  let garage={...createDefaultFarmLayout(),onboarding:{status:'complete',introSeen:true}};
  const pool={connect:async()=>({release(){},async query(sql,args){
    if(sql.includes('select garage'))return {rows:[{garage}]};
    if(sql.includes('select entitlement_id'))return {rows:[]};
    if(sql.includes('update game_loadouts'))garage=JSON.parse(args[2]);
    return {rows:[]};
  }})};
  const now=1800000000000;
  assert.equal((await refreshFarmHorses(pool,{playerId:'player'},now)).ok,true);
  assert.equal(garage.horseStockRefreshedAt,now);
  assert.equal((await refreshFarmHorses(pool,{playerId:'player'},now+1)).error,'refresh_cooldown');
  assert.equal((await refreshFarmHorses(pool,{playerId:'player'},now+HORSE_REFRESH_COOLDOWN_MS)).ok,true);
});
