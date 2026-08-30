
global.HotelCollision=(function(){
  const c=v=>Math.abs(v)<1e-12?0:Number(Number(v).toFixed(9));
  function rotateY(x,z,a){return{x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)}}
  function boxBounds({x=0,y=0,z=0,w,h,d,rotationY=0}){const co=Math.abs(Math.cos(rotationY)),si=Math.abs(Math.sin(rotationY));const hx=(co*w+si*d)/2,hz=(si*w+co*d)/2;return{minX:c(x-hx),maxX:c(x+hx),minY:c(y-h/2),maxY:c(y+h/2),minZ:c(z-hz),maxZ:c(z+hz)}}
  function hingedBounds(door,angle=0){const o=rotateY(door.localX,door.localZ,angle);return boxBounds({x:door.hingeX+o.x,y:door.y,z:door.hingeZ+o.z,w:door.w,h:door.h,d:door.d,rotationY:angle})}
  function slidingBounds(door,amount=0){const travel=.46+(1.72-.46)*amount;return boxBounds({x:door.centerX+door.direction*travel,y:door.y,z:door.z,w:door.w,h:door.h,d:door.d})}
  function walkHeightAt(s,x,z,y,snap,dyn={}){let best=null,bp=-Infinity,bd=Infinity;for(const a of s){if(x<a.minX||x>a.maxX||z<a.minZ||z>a.maxZ)continue;let yy;if(a.kind==='ramp'){let t=(z-a.startZ)/(a.endZ-a.startZ);t=Math.max(0,Math.min(1,t));yy=a.startY+(a.endY-a.startY)*t}else if(a.kind==='dynamic'){if(typeof dyn[a.id]!=='number')continue;yy=dyn[a.id]}else yy=a.y;const diff=Math.abs(yy-y),p=a.priority||0;if(diff<=snap&&(p>bp||(p===bp&&diff<bd))){best=yy;bp=p;bd=diff}}return best}
  function collidesAt(colliders,{x,z,feetY,bodyHeight=1.78,radius=.34}){const minY=feetY+.06,maxY=feetY+bodyHeight;return colliders.some(b=>!(maxY<=b.minY+.015||minY>=b.maxY-.015)&&(x>b.minX-radius&&x<b.maxX+radius&&z>b.minZ-radius&&z<b.maxZ+radius))}
  return{boxBounds,hingedBounds,slidingBounds,walkHeightAt,collidesAt,rotateY,resolveColliders(){},createBoxCollider(){},segmentBlocked(){}};
})();
const P=require('./cinema-plan.js');
const FH=4.6;
const plan=P.createCinemaPlan({config:{floorHeight:FH},floorDefs:P.FLOOR_DEFS,layout:{getRoomFillLight(){return{}}},floorY:f=>(f-1)*FH,keyIdForFloor:f=>'',keyLabelForFloor:f=>''});
function A(v,m){if(!v)throw new Error(m)}
function ground(x,z,y=0){return HotelCollision.walkHeightAt(plan.surfaces,x,z,y,.62,{})}
function blocked(x,z,y=0,r=.34){return HotelCollision.collidesAt(plan.colliders,{x,z,feetY:y,bodyHeight:1.78,radius:r})}
function clearAt(x,z,y=0,r=.31){const g=ground(x,z,y);return g!==null&&!blocked(x,z,g,r)}

A(plan.roomDoors.length===12,'expected 12 theater/booth doors');
A(plan.navigation.connectors.length===2,'expected two physical stair connectors');
A(plan.hallDoors.length===0,'cinema must not have elevator hall doors');
A(plan.slidingDoors.length===0,'cinema must not have elevator sliding doors');
A(!plan.boxes.some(b=>b.kind==='call-button'),'cinema must not have elevator call buttons');
A(plan.elevator.centerX>900,'dummy engine elevator metadata must stay outside map');
A(plan.boxes.filter(b=>String(b.id||'').startsWith('screen-')).length===6,'expected six large screens');
A(plan.boxes.filter(b=>b.material==='upholstery').length>700,'seat visual geometry missing');

// Floor 1: broad representative grid must always have ground. This specifically prevents V2 holes.
for(let x=-60;x<=60;x+=10){
  for(let z=-48;z<=48;z+=8){
    A(ground(x,z,0)!==null,`floor1 hole at ${x},${z}`);
  }
}

// Floor 2: one continuous mezzanine rectangle, no holes anywhere inside it.
for(let x=-27;x<=27;x+=6){
  for(let z=-17;z<=45;z+=6){
    A(ground(x,z,FH)!==null,`floor2 hole at ${x},${z}`);
  }
}

// Runtime review spawn.
A(clearAt(0,-44,0),'review spawn blocked');
for(const [dx,dz,n] of [[.35,0,'E'],[-.35,0,'W'],[0,.35,'N'],[0,-.35,'S']])A(clearAt(dx,-44+dz,0),`spawn step ${n} blocked`);

// Dynamic doors: clear centerline on both sides when open.
for(const d of plan.roomDoors){
  const y=(d.floor-1)*FH, east=d.openAngle<0;
  const outside=d.x+(east?1.0:-1.0),inside=d.x+(east?-1.8:1.8);
  for(let i=0;i<=8;i++){
    const x=outside+(inside-outside)*(i/8),g=ground(x,d.z,y);
    A(g!==null,`door ${d.roomNumber} no ground ${i}`);
    A(!blocked(x,d.z,g,.29),`door ${d.roomNumber} static blocked ${i}`);
  }
  const leaf=HotelCollision.hingedBounds(d,d.openAngle);
  A(!(d.x>leaf.minX-.24&&d.x<leaf.maxX+.24&&d.z>leaf.minZ-.24&&d.z<leaf.maxZ+.24),`open leaf covers ${d.roomNumber}`);
}

// Sound-lock route: door -> offset vestibule opening -> rear ramp must be clear.
for(const aud of plan.qa.auditoriums){
  const west=aud.side==='west';
  const inner=west?aud.maxX:aud.minX;
  const p1={x:inner+(west?-2.2:2.2),z:aud.entryZ};
  const p2={x:west?aud.maxX-4.1:aud.minX+4.1,z:aud.minZ+5.2};
  const p3={x:west?aud.maxX-4.2:aud.minX+4.2,z:aud.seatMinZ-.8};
  for(const [i,p] of [p1,p2,p3].entries()){
    const g=ground(p.x,p.z,0);
    A(g!==null,`sound lock ${aud.id} no ground ${i}`);
    A(!blocked(p.x,p.z,g,.28),`sound lock ${aud.id} blocked ${i}`);
  }
}

// Emergency exits are real open passages.
for(const aud of plan.qa.auditoriums){
  const west=aud.side==='west',from=west?aud.minX+1:aud.maxX-1,to=west?aud.minX-1:aud.maxX+1,z=aud.serviceExitZ;
  for(let i=0;i<=8;i++){
    const x=from+(to-from)*(i/8),g=ground(x,z,0);
    A(g!==null,`exit ${aud.id} no ground`);
    A(!blocked(x,z,g,.29),`exit ${aud.id} blocked`);
  }
}

// Center aisle: rear to front, all six auditoriums.
for(const aud of plan.qa.auditoriums){
  const west=aud.side==='west',z=(aud.seatMinZ+aud.seatMaxZ)/2;
  const rear=west?aud.maxX-5:aud.minX+5,front=west?aud.minX+7:aud.maxX-7;
  let y=.55;
  for(let i=0;i<=28;i++){
    const x=rear+(front-rear)*(i/28),g=ground(x,z,y);
    A(g!==null,`aisle ${aud.id} no ground ${i}`);
    A(!blocked(x,z,g,.29),`aisle ${aud.id} blocked ${i}`);
    y=g;
  }
  const s=plan.boxes.find(b=>b.id===`screen-${aud.id}`);
  A(s&&s.d>=11&&s.h>=3.5,`screen ${aud.id} too small`);
}

// Both stairs: continuous bottom->top and usable entry/exit.
for(const conn of plan.navigation.connectors){
  A(conn.layout.flights.length===1,`${conn.id} should be one straight run`);
  const f=conn.layout.flights[0];
  for(let i=0;i<=28;i++){
    const t=i/28,z=f.startZ+(f.endZ-f.startZ)*t,expect=FH*t,g=ground(f.startX,z,expect);
    A(g!==null,`${conn.id} missing stair ground ${i}`);
    A(Math.abs(g-expect)<.13,`${conn.id} wrong stair height ${i}`);
    A(!blocked(f.startX,z,g,.28),`${conn.id} blocked ${i}`);
  }
  A(clearAt(f.startX,f.startZ-1,0,.28),`${conn.id} bottom entrance blocked`);
  A(clearAt(f.endX,f.endZ+.8,FH,.28),`${conn.id} top exit blocked`);
}

// Projection corridor and booths.
for(const z of [-15,-7,13,35,44])A(clearAt(0,z,FH,.29),`projection corridor blocked ${z}`);
for(const b of plan.qa.booths){
  const c=plan.roomCenters.find(r=>r.roomNumber===b.id);
  A(c&&clearAt(c.x,c.z,FH,.28),`booth ${b.id} center blocked`);
}

// No same-height slab overlaps. Prevents texture flicker.
for(const floor of [1,2]){
  const slabs=plan.boxes.filter(b=>b.floor===floor&&b.kind==='slab'&&b.group!=='furnishing');
  for(let i=0;i<slabs.length;i++)for(let j=i+1;j<slabs.length;j++){
    const a=slabs[i],b=slabs[j];if(Math.abs(a.y-b.y)>.001)continue;
    const ox=Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2);
    const oz=Math.min(a.z+a.d/2,b.z+b.d/2)-Math.max(a.z-a.d/2,b.z-b.d/2);
    A(!(ox>.01&&oz>.01),`coplanar slab overlap floor ${floor} ${i}/${j}`);
  }
}

// Navigation graph contract.
const byId=new Map(plan.navigation.nodes.map(n=>[n.id,n]));
for(const [a,b] of plan.navigation.edges){
  A(byId.has(a)&&byId.has(b),`bad nav edge ${a}/${b}`);
  A(byId.get(a).floor===byId.get(b).floor,`cross-floor nav edge ${a}/${b}`);
}
for(const floor of [1,2]){
  const ids=plan.navigation.nodes.filter(n=>n.floor===floor).map(n=>n.id),set=new Set(ids),adj=new Map(ids.map(id=>[id,[]]));
  for(const [a,b] of plan.navigation.edges)if(set.has(a)&&set.has(b)){adj.get(a).push(b);adj.get(b).push(a)}
  const seen=new Set(),stack=[ids[0]];
  while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);for(const n of adj.get(id)||[])stack.push(n)}
  A(seen.size===ids.length,`floor ${floor} nav disconnected ${seen.size}/${ids.length}`);
}

console.log(JSON.stringify({
  result:'PASS',
  rooms:plan.roomDoors.length,
  screens:plan.boxes.filter(b=>String(b.id||'').startsWith('screen-')).length,
  seatVisualParts:plan.boxes.filter(b=>b.material==='upholstery').length,
  boxes:plan.boxes.length,
  colliders:plan.colliders.length,
  surfaces:plan.surfaces.length,
  stairTreads:plan.stairs.treads.length,
  stairConnectors:plan.navigation.connectors.length,
  floor1BaseSlabs:plan.boxes.filter(b=>b.floor===1&&b.kind==='slab'&&Math.abs(b.y+.1)<.001).length,
  floor2BaseSlabs:plan.boxes.filter(b=>b.floor===2&&b.kind==='slab'&&Math.abs(b.y-(FH-.1))<.001).length,
  hallDoors:plan.hallDoors.length,
  callButtons:plan.boxes.filter(b=>b.kind==='call-button').length
},null,2));
