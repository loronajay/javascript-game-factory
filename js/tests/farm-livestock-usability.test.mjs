import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVESTOCK_CATALOG, livestockProductsFor } from '../farm-catalog/livestock.mjs';
import { farmLivestockRule, farmLivestockProductsFor } from '../../platform-api/src/services/farm-livestock-catalog.mjs';
import { goodsState, newLivestockCare } from '../farm-livestock-care.mjs';
import { normalizeLivestockAnimal } from '../farm-livestock.mjs';
import { queryLivestock } from '../farm-livestock-list.mjs';

const query = {search:'', species:'', gender:'', status:'', sort:'name'};
const homes = [{id:'pen', title:'North pen', slots:8, species:null}];
function animal(id, speciesId, gender, options={}) {
  return normalizeLivestockAnimal({id:`stock-${id.padEnd(8, '0')}`, name:id, speciesId:`livestock.${speciesId}`, gender,
    stats:{yield:50, quality:50, growth:50, hardiness:50}, bornAt:-20000, homeId:'pen', care:newLivestockCare(0), ...options});
}

test('client and server agree on products for both sexes of every livestock species', () => {
  for (const species of LIVESTOCK_CATALOG) for (const sex of ['female','male']) {
    const rule = farmLivestockRule(species.id);
    const client = livestockProductsFor(species, sex).map(({itemId,everyDays,dayValue,onlyFrom})=>({itemId,everyDays,dayValue,onlyFrom}));
    const server = farmLivestockProductsFor(rule, sex).map(({itemId,everyDays,dayValue,onlyFrom})=>({itemId,everyDays,dayValue,onlyFrom}));
    assert.deepEqual(client, server, `${species.id} ${sex}`);
  }
});

test('males cannot offer milk or eggs even when a saved care record has ready progress', () => {
  for (const [species,id] of [['cow','milk'],['sheep','milk-sheep'],['chicken','egg']]) {
    const care = {...newLivestockCare(0), progress:{[id]:100000, wool:100000}};
    const male = animal('male',species,'male',{care});
    assert.equal(goodsState(male,care).some(g=>g.product.itemId===id),false);
    assert.equal(farmLivestockProductsFor(farmLivestockRule(male.speciesId),'male').some(g=>g.itemId===id),false);
    const female = animal('female',species,'female',{care});
    assert.equal(goodsState(female,care).find(g=>g.product.itemId===id).ready,true);
    if(species==='sheep') assert.equal(goodsState(male,care).find(g=>g.product.itemId==='wool').ready,true);
  }
});

const hen=animal('Amber','chicken','female',{care:{...newLivestockCare(0),progress:{egg:1440}}});
const rooster=animal('Zorro','chicken','male',{care:{...newLivestockCare(0),hunger:30,progress:{egg:1440}}});
const cow=animal('Daisy','cow','female');
const herd=Object.freeze([rooster,cow,hen]);
test('search, species, sex and ready/hungry filters combine without changing the herd', () => {
  const pick = options => queryLivestock(herd,homes,0,10,{...query,...options}).map(a=>a.name);
  assert.deepEqual(pick({search:' NORTH '}),['Amber','Daisy','Zorro']);
  assert.deepEqual(pick({species:'livestock.chicken',gender:'female'}),['Amber']);
  assert.deepEqual(pick({status:'ready'}),['Amber']);
  assert.deepEqual(pick({status:'hungry'}),['Zorro']);
  assert.deepEqual(pick({search:'missing'}),[]);
  assert.deepEqual(pick({sort:'hunger'}),['Zorro','Amber','Daisy']);
  assert.deepEqual(pick({sort:'ready'}),['Amber','Daisy','Zorro']);
  assert.deepEqual(herd.map(a=>a.name),['Zorro','Daisy','Amber']);
});

test('ready-to-breed filter respects food, shared housing, level and space', () => {
  const sire=animal('Sire','cow','male');
  const pair=[cow,sire];
  const pick=(animals=pair,places=homes,level=10)=>queryLivestock(animals,places,0,level,{...query,status:'breed'}).map(a=>a.name);
  assert.deepEqual(pick(),['Daisy']);
  assert.deepEqual(pick(pair,homes,1),[]);
  assert.deepEqual(pick(pair,[{...homes[0],slots:2}]),[]);
  assert.deepEqual(pick([cow,{...sire,homeId:'other'}]),[]);
  assert.deepEqual(pick([cow,{...sire,care:{...sire.care,hunger:30}}]),[]);
});

test('a fifty-animal herd stays complete across compact pages and shrinking filters', async () => {
  const {livestockOverview,livestockPage}=await import('../farm-livestock-list.mjs');
  const flock=Array.from({length:50},(_,i)=>animal(`Hen${String(i).padStart(3,'0')}`,'chicken','female',{
    homeId:i===49?null:'pen', care:{...newLivestockCare(0),hunger:i<20?30:100,progress:{egg:i<12?1440:0}}
  }));
  const overview=livestockOverview(flock,homes,0,10);
  assert.equal(overview.total,50);
  assert.equal(overview.readyAnimals,12);
  assert.equal(overview.readyGoods,12);
  assert.equal(overview.needsFeed,20);
  assert.equal(overview.unhoused,1);
  assert.equal(overview.species.length,1);
  assert.equal(overview.species[0].females,50);
  const ordered=queryLivestock(flock,homes,0,10,query);
  const pages=Array.from({length:5},(_,i)=>livestockPage(ordered,i));
  assert.ok(pages.every(p=>p.animals.length===10&&p.pages===5));
  assert.deepEqual(pages.flatMap(p=>p.animals.map(a=>a.id)),ordered.map(a=>a.id));
  const ready=queryLivestock(flock,homes,0,10,{...query,status:'ready'});
  const clamped=livestockPage(ready,4);
  assert.equal(clamped.page,1);
  assert.equal(clamped.start,11);
  assert.equal(clamped.end,12);
  assert.equal(livestockPage([],100).start,0);
  assert.equal(livestockPage([],100).page,0);
  assert.equal(queryLivestock(flock,homes,0,10,{...query,status:'needs_feed'}).length,20);
  assert.equal(queryLivestock(flock,homes,0,10,{...query,status:'unhoused'})[0].id,flock[49].id);
});

test('age sorts use birth time across species and preserve the saved order', () => {
  const animals = [animal('Young','cow','female',{bornAt:-100}), animal('Old','chicken','male',{bornAt:-30000}), animal('Middle','pig','female',{bornAt:-10000})];
  const pick = sort => queryLivestock(animals,homes,0,10,{...query,sort}).map(a=>a.name);
  assert.deepEqual(pick('youngest'), ['Young','Middle','Old']);
  assert.deepEqual(pick('oldest'), ['Old','Middle','Young']);
  assert.deepEqual(animals.map(a=>a.name), ['Young','Old','Middle']);
});
