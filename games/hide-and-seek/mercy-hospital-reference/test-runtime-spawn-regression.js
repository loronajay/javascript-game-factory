
global.HotelCollision=(function(){
  const c=v=>Math.abs(v)<1e-12?0:Number(Number(v).toFixed(9));
  function boxBounds({x=0,y=0,z=0,w,h,d,rotationY=0}) {
    const co=Math.abs(Math.cos(rotationY)),si=Math.abs(Math.sin(rotationY));
    const hx=(co*w+si*d)/2,hz=(si*w+co*d)/2;
    return {minX:c(x-hx),maxX:c(x+hx),minY:c(y-h/2),maxY:c(y+h/2),minZ:c(z-hz),maxZ:c(z+hz)};
  }
  function walkHeightAt(s,x,z,y,snap,dyn={}) {
    let best=null,bp=-Infinity,bd=Infinity;
    for(const a of s){
      if(x<a.minX||x>a.maxX||z<a.minZ||z>a.maxZ)continue;
      let yy;
      if(a.kind==='ramp'){
        let t=(z-a.startZ)/(a.endZ-a.startZ);
        t=Math.max(0,Math.min(1,t));
        yy=a.startY+(a.endY-a.startY)*t;
      } else if(a.kind==='dynamic'){
        if(typeof dyn[a.id]!=='number')continue;
        yy=dyn[a.id];
      } else yy=a.y;
      const diff=Math.abs(yy-y),p=a.priority||0;
      if(diff<=snap&&(p>bp||(p===bp&&diff<bd))){best=yy;bp=p;bd=diff;}
    }
    return best;
  }
  function collidesAt(colliders,{x,z,feetY,bodyHeight=1.78,radius=.34}) {
    const minY=feetY+.06,maxY=feetY+bodyHeight;
    return colliders.some(b =>
      !(maxY<=b.minY+.015||minY>=b.maxY-.015) &&
      x>b.minX-radius && x<b.maxX+radius &&
      z>b.minZ-radius && z<b.maxZ+radius
    );
  }
  return {boxBounds,walkHeightAt,collidesAt,resolveColliders(){},hingedBounds(){},slidingBounds(){},rotateY(){},createBoxCollider(){},segmentBlocked(){}};
})();

const H=require('./hospital-plan.js');
const FH=4.6;
const p=H.createHospitalPlan({
  config:{floorHeight:FH},
  floorDefs:H.FLOOR_DEFS,
  layout:{getRoomFillLight(){return{color:0xffddb0,intensity:.4,emissiveIntensity:.5,distance:8,decay:2,castShadow:false,strategy:'emissive'}}},
  floorY:f=>(f-1)*FH,
  keyIdForFloor:f=>`floor-${f}-master`,
  keyLabelForFloor:f=>`Floor ${f} Master Key`
});

function A(v,m){if(!v)throw new Error(m)}
function ground(x,z,y=0){return HotelCollision.walkHeightAt(p.surfaces,x,z,y,.62,{'elevator-car':0})}
function blocked(x,z,y=0,r=.34){return HotelCollision.collidesAt(p.colliders,{x,z,feetY:y,bodyHeight:1.78,radius:r})}

const rendererDefault={x:0,z:32,y:0};
const corrected={x:0,z:-27,y:0};

A(blocked(rendererDefault.x,rendererDefault.z,rendererDefault.y,.34) || ground(rendererDefault.x,rendererDefault.z,rendererDefault.y)===null,
  'renderer default is unexpectedly valid');
A(ground(corrected.x,corrected.z,corrected.y)!==null,'corrected spawn has no ground');
A(!blocked(corrected.x,corrected.z,corrected.y,.34),'corrected spawn intersects collider');

for(const [dx,dz,name] of [[.25,0,'east'],[-.25,0,'west'],[0,.25,'south'],[0,-.25,'north']]){
  A(ground(corrected.x+dx,corrected.z+dz,corrected.y)!==null,`no ground ${name}`);
  A(!blocked(corrected.x+dx,corrected.z+dz,corrected.y,.34),`blocked ${name}`);
}

console.log(JSON.stringify({
  result:'PASS',
  rendererDefaultRejected:true,
  correctedSpawn:corrected,
  cardinalMovementProbes:4
}, null, 2));
