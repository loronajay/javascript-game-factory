import { createTree, createWillow } from "./farm-props-plants.mjs";
import { regionWaterDistance, regionShoreTrees, type FishingRegion } from "./farm-fishing-regions.mjs";

type Three = Record<string, any>;

const profile = [[-.7,-28.8],[0,-28.8],[5.45,-29.6],[5.95,-29.9],[6.3,-32.3],[7,-32.9],[13.5,-33.4],[14.2,-36.5],[15,-40]] as const;
export function fernfallFlowZ(y: number): number {
    for (let i = 1; i < profile.length; i++) {
      const [y1,z1] = profile[i]!, [y0,z0] = profile[i-1]!;
      if (y <= y1) { const t = Math.max(0,(y-y0)/(y1-y0)); return z0 + (z1-z0)*t*t*(3-2*t); }
    }
    return -40;
  }

function smoothBank(value:number,lo:number,hi:number) { const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));return t*t*(3-2*t); }
export function fernfallRockFace(x: number, y: number) {
    const channel = 1 - smoothBank(Math.abs(x+9),3.5,8);
    const background = -34.8-y*.18+Math.sin(x*.21)*.8+Math.sin(y*1.7+x*.44)*.24;
    return [x,y,background*(1-channel)+(fernfallFlowZ(y)-.22+Math.exp(-(((Math.abs(x+9)-3.15)/.65)**2))*.95)*channel];
  }

/** Fernfall's scenery stays outside the walking banks; the shared pool/cast geometry is unchanged. */
export function createFernfallScenery(THREE: Three, root: any, region: FishingRegion, time: { value: number }) {
  const daylight = Math.min(1, root.parent?.children.find((object: any) => object.isHemisphereLight)?.intensity ?? 1);
  let seed = 781;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const stone = ["#526862", "#617770", "#435b57", "#71817a"].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  function boulder(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = new THREE.Mesh(geometry, stone[Math.floor(random() * stone.length)]);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(random() * .16, random() * 6.28, random() * .12);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }

  // The cliff and water sample ONE profile, so there is no floating shelf or gap at any viewing angle.
  const heightAt = (x: number) => 15.5 + Math.sin(x*.18)*1.3 + Math.sin(x*.47)*.45;
  const cliffVertices: number[] = [], cliffColors: number[] = [];
  const cliffTone = new THREE.Color();
  const levels = [-.7,0,1.5,3,4.5,5.45,5.95,6.3,7,9,11,12.5,13.5,14.2,15.8];
  for (const [lo,hi] of [[5.45,7],[13.5,14.2]]) for(let y=lo!+.08;y<hi!;y+=.08) levels.push(y);
  levels.sort((a,b)=>a-b);
  for (let c=0;c<116;c++) for(let row=0;row<levels.length-1;row++) {
    for(const [column,r] of [[c,row],[c+1,row],[c,row+1],[c,row+1],[c+1,row],[c+1,row+1]]) {
      const x=-58+column!;
      const irregularity=(1-Math.exp(-(((x+9)/9)**4)))*Math.sin(x*.73+levels[r!]!*.9)*.18;
      const y=Math.min(levels[r!]!+(r!>0?irregularity:0),heightAt(x));
      cliffVertices.push(...fernfallRockFace(x,y));
      const damp=(1-smoothBank(Math.abs(x+9),2.7,6.5))*(1-smoothBank(y,13.5,15));
      cliffTone.set('#64736b').lerp(new THREE.Color('#405c58'),damp*.7);
      if(y>heightAt(x)-.7) cliffTone.lerp(new THREE.Color('#586e4c'),.7);
      cliffTone.multiplyScalar(.96+Math.sin(x*.43+y*.2)*.025);
      cliffColors.push(cliffTone.r,cliffTone.g,cliffTone.b);
    }
  }
  const cliffGeo=new THREE.BufferGeometry();
  cliffGeo.setAttribute('position',new THREE.Float32BufferAttribute(cliffVertices,3));
  const rockUvs:number[]=[];
  for(let i=0;i<cliffVertices.length;i+=3) rockUvs.push(cliffVertices[i]!/3,cliffVertices[i+1]!/3);
  cliffGeo.setAttribute('uv',new THREE.Float32BufferAttribute(rockUvs,2));
  cliffGeo.setAttribute('color',new THREE.Float32BufferAttribute(cliffColors,3)); cliffGeo.computeVertexNormals();
  const rockCanvas=document.createElement('canvas');rockCanvas.width=rockCanvas.height=256;
  const rockContext=rockCanvas.getContext('2d')!;
  rockContext.fillStyle='#bac1b8';rockContext.fillRect(0,0,256,256);
  for(let i=0;i<18000;i++) {
    const shade=145+Math.floor(random()*75);rockContext.fillStyle=`rgba(${shade},${shade+3},${shade},.26)`;
    rockContext.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);
  }
  const rockTexture=new THREE.CanvasTexture(rockCanvas);rockTexture.wrapS=rockTexture.wrapT=THREE.RepeatWrapping;rockTexture.colorSpace=THREE.SRGBColorSpace;
  const cliff=new THREE.Mesh(cliffGeo,new THREE.MeshStandardMaterial({map:rockTexture,bumpMap:rockTexture,bumpScale:.035,vertexColors:true,roughness:1,side:THREE.DoubleSide}));
  cliff.castShadow=true; cliff.receiveShadow=true; root.add(cliff);
  // Cap the rock mass back into the forest instead of leaving an infinitely thin scenic wall.
  const topVertices:number[]=[];
  for(let c=0;c<116;c++) {
    const x=-58+c, a=fernfallRockFace(x,heightAt(x)), b=fernfallRockFace(x+1,heightAt(x+1));
    topVertices.push(...a,...b,x,heightAt(x)-.2,-49,x,heightAt(x)-.2,-49,...b,x+1,heightAt(x+1)-.2,-49);
  }
  const topGeo=new THREE.BufferGeometry(); topGeo.setAttribute('position',new THREE.Float32BufferAttribute(topVertices,3));topGeo.computeVertexNormals();
  root.add(new THREE.Mesh(topGeo,new THREE.MeshStandardMaterial({color:'#526647',roughness:1,side:THREE.DoubleSide})));
  for(let i=0;i<22;i++) {
    const x=-51+i*4.8;
    if(Math.abs(x+9)>7) boulder(x,.5,-33.3,1.6+random(),.8+random(),1.4);
    if(i%3===0){const tree=createTree(THREE,810+i);tree.position.set(x,heightAt(x)-.2,-44);tree.scale.setScalar(.9+random()*.5);root.add(tree);}
  }

  // A curved cross-section gives the cascade depth. Broad, irregular turbulence replaces neon pinstripes.
  const cascade = new THREE.ShaderMaterial({
    uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time,daylight:{value:daylight}},
    transparent:true,side:THREE.DoubleSide,depthWrite:false,fog:true,
    vertexShader:`varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float time;uniform float daylight;varying vec2 vUv;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
      void main(){
        vec2 flow=vec2(vUv.x*19.,vUv.y*6.+time*2.8);
        float n=noise(flow)+noise(flow*2.1+vec2(6.,-time))*.4;
        float crest=smoothstep(.54,1.1,n);
        float edge=smoothstep(0.,.08,vUv.x)*smoothstep(0.,.08,1.-vUv.x);
        vec3 color=mix(vec3(.30,.55,.54),vec3(.76,.86,.81),crest*.5+.3);
        gl_FragColor=vec4(color*daylight,edge*(.69+crest*.18));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const waterVertices:number[]=[], waterUvs:number[]=[];
  const at=(row:number,column:number)=>{
    const t=row/180,u=column/24,y=14.2-t*14.52;
    const width=4.1+(1-t)*.25+t*1.4+Math.sin(t*19)*.12;
    const x=-9+(u-.5)*width;
    return [x,y,fernfallFlowZ(y)+.16+Math.sin(u*Math.PI)*.28+Math.sin(t*22+u*8)*.025];
  };
  for(let r=0;r<180;r++) for(let c=0;c<24;c++) {
    for(const [row,col] of [[r,c],[r+1,c],[r,c+1],[r,c+1],[r+1,c],[r+1,c+1]]) {
      waterVertices.push(...at(row!,col!));waterUvs.push(col!/24,1-row!/180);
    }
  }
  const waterGeo=new THREE.BufferGeometry();waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(waterVertices,3));
  waterGeo.setAttribute('uv',new THREE.Float32BufferAttribute(waterUvs,2));waterGeo.computeVertexNormals();
  const waterfall=new THREE.Mesh(waterGeo,cascade);waterfall.name='fernfall-continuous-cascade';root.add(waterfall);

  const foamMaterial=new THREE.ShaderMaterial({
    uniforms:{time,daylight:{value:daylight}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float time;uniform float daylight;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);
        float swirl=sin(p.x*22.+sin(p.y*17.+time*1.7)*2.-time*2.)*.5+.5;
        float foam=(1.-smoothstep(.32,1.,r))*(.18+swirl*.38);
        gl_FragColor=vec4(vec3(.68,.82,.75)*daylight,foam);}`,
  });
  for(const [x,y,z,sx,sz] of [[-9,-.278,-28.3,4.3,2.4],[-9,6.01,-31,2.5,1.35]]) {
    const foam=new THREE.Mesh(new THREE.PlaneGeometry(2,2),foamMaterial);foam.rotation.x=-Math.PI/2;
    foam.position.set(x,y,z);foam.scale.set(sx,sz,1);root.add(foam);
  }

  // A soft radial texture serves both drifting spray and the low impact cloud.
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(220,244,231,.6)"); gradient.addColorStop(.4, "rgba(220,244,231,.22)"); gradient.addColorStop(1, "rgba(220,244,231,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const sprayMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: .32 * daylight, depthWrite: false });
  const spray: any[] = [];
  for (let i = 0; i < 22; i++) {
    const sprite = new THREE.Sprite(sprayMaterial); sprite.userData.phase = random();
    sprite.userData.x = -9 + (random() - .5) * 7; sprite.userData.z = -28.3 + random() * 1.6;
    const size = 1.1 + random() * 1.8; sprite.scale.set(size, size * .65, 1); root.add(sprite); spray.push(sprite);
  }
  const rings: any[] = [];
  for (let i = 0; i < 3; i++) {
    const material = new THREE.MeshBasicMaterial({ color: "#d6eee0", transparent: true, opacity: .2, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(.985, 1, 80), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(-9, -.275 + i * .001, -28.3); root.add(mesh); rings.push(mesh);
  }

  // A feathered, muted bank replaces the pale, perfectly solid ellipse border.
  for (const pool of region.pools) {
    const vertices: number[] = [], colors: number[] = [];
    const tones = ["#536c60", "#657963", "#405a3e"].map(c => new THREE.Color(c));
    function vertex(step: number, band: number) {
      const a = step / 192 * Math.PI * 2;
      const offset = [0, .32, 1.05 + Math.sin(a * 17) * .22 + Math.sin(a * 9) * .15][band]!;
      const x = pool.x + Math.cos(a) * (pool.rx + offset), z = pool.z + Math.sin(a) * (pool.rz + offset);
      vertices.push(x, [.012, .025, .012][band]!, z); colors.push(tones[band].r, tones[band].g, tones[band].b);
    }
    for (let i = 0; i < 192; i++) {
      const a = (i + .5) / 192 * Math.PI * 2;
      if (regionWaterDistance(region, { x: pool.x + Math.cos(a) * (pool.rx + .15), z: pool.z + Math.sin(a) * (pool.rz + .15) }) > 0) continue;
      for (let band = 0; band < 2; band++) for (const [s, b] of [[i, band], [i + 1, band], [i, band + 1], [i, band + 1], [i + 1, band], [i + 1, band + 1]]) vertex(s!, b!);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
  }

  // Delicate feathered fronds: narrow leaflets sit on a curved rachis, with no solid cone at the base.
  const leaves: number[] = [];
  const triangle = (a: number[], b: number[], c: number[]) => leaves.push(...a,...b,...c);
  for(let frond=0;frond<9;frond++) {
    const angle=frond/9*Math.PI*2, length=.65+(frond%3)*.12;
    const at=(t:number,side=0,lift=0)=>[Math.cos(angle)*t*length-Math.sin(angle)*side,.05+Math.sin(t*Math.PI*.86)*.55+lift,Math.sin(angle)*t*length+Math.cos(angle)*side];
    for(let j=0;j<16;j++) {
      const t=j/16, next=(j+1)/16;
      triangle(at(t,-.007),at(next,-.004),at(t,.007)); triangle(at(t,.007),at(next,-.004),at(next,.004));
    }
    for(let j=2;j<15;j++) {
      const t=j/16,w=Math.sin(t*Math.PI)*.14;
      for(const side of [-1,1]) {
        const base=at(t), shoulder=at(t+.025,w*.48*side,.018),tip=at(t+.1,w*side,.008),edge=at(t+.065,w*.42*side,-.008);
        triangle(base,shoulder,tip);triangle(base,tip,edge);
      }
    }
  }
  const fernGeo = new THREE.BufferGeometry(); fernGeo.setAttribute("position", new THREE.Float32BufferAttribute(leaves, 3)); fernGeo.computeVertexNormals();
  const fernMaterial = new THREE.MeshStandardMaterial({ color: "#527b3e", roughness: 1, side: THREE.DoubleSide });
  const fern = new THREE.InstancedMesh(fernGeo, fernMaterial, 420);
  const dummy = new THREE.Object3D(); let count = 0;
  const planted: Array<{x:number;z:number}> = [];
  const fixtures = [{x:10,z:23,r:2.2},{x:13,z:24,r:1.4},{x:18,z:24,r:2.8},{x:31,z:29,r:2},{x:21.6,z:25,r:2.3},{x:32,z:16,r:2.5}];
  for (let i = 0; i < 800 && count < 420; i++) {
    const x = (random() - .5) * 80, z = (random() - .5) * 76;
    const distance = regionWaterDistance(region, { x, z });
    if (distance > -1.2 || (Math.abs(z - 20) < 2.3 && x > 8) || distance < -12) continue;
    const cluster = Math.sin(x * .46 + z * .21) + Math.cos(z * .6 - x * .3);
    if (cluster < -.3 || fixtures.some(p=>Math.hypot(p.x-x,p.z-z)<p.r)
      || planted.some(p=>Math.hypot(p.x-x,p.z-z)<1.1)
      || regionShoreTrees(region).some(p=>Math.hypot(p.x-x,p.z-z)<2)) continue;
    planted.push({x,z});
    dummy.position.set(x, 0, z); dummy.rotation.y = random() * 6.28; dummy.scale.setScalar(.6 + random() * .5); dummy.updateMatrix();
    fern.setMatrixAt(count, dummy.matrix); fern.setColorAt(count, new THREE.Color().setHSL(.24 + random() * .06, .32, .28 + random() * .11)); count++;
  }
  fern.count = count; fern.receiveShadow = true; root.add(fern);

  // Irregular forest layers: keep trunks off playable routes and vary scale and silhouette.
  for (let i = 0; i < 45; i++) {
    const a = i / 45 * Math.PI * 2;
    const x = Math.cos(a) * (43 + random() * 8), z = Math.sin(a) * (43 + random() * 8);
    if (z < -33 || (x > 30 && Math.abs(z - 20) < 6)) continue;
    const tree = i % 4 === 0 ? createWillow(THREE, i + 940) : createTree(THREE, i + 940);
    tree.position.set(x, -.1, z); tree.rotation.y = random() * 6.28; tree.scale.setScalar(1.4 + random() * 1.3); root.add(tree);
  }
  for (const [i, point] of regionShoreTrees(region).entries()) {
    const tree = i % 2 === 0 ? createWillow(THREE, 730 + i) : createTree(THREE, 730 + i);
    tree.position.set(point.x, 0, point.z); tree.rotation.y = random() * 6.28; tree.scale.setScalar(1.2 + random() * .45); root.add(tree);
  }
  // Beyond the exit trigger, the return trail disappears into forest rather than an empty horizon.
  for (let i = 0; i < 12; i++) {
    const x = 55 + random() * 14, z = -1 + i * 3.6;
    const y = (1 - Math.exp(-(x - 39) / 16)) * (7 + Math.sin(x * .045 + z * .033) * 3);
    const tree = createTree(THREE, i + 1150); tree.position.set(x, y, z); tree.scale.setScalar(1.8 + random() * .8); root.add(tree);
  }
  // Broken shoreline stones sit in little groups, leaving open casting banks.
  for (let i = 0; i < 85; i++) {
    const pool = region.pools[i % region.pools.length]!, a = random() * Math.PI * 2;
    const x = pool.x + Math.cos(a) * (pool.rx + .15), z = pool.z + Math.sin(a) * (pool.rz + .15);
    if (regionWaterDistance(region, { x, z }) > .1 || Math.sin(a * 5) < -.2) continue;
    const size = .25 + random() * .65; boulder(x, .02, z, size * 1.5, size * .55, size);
  }
  return (seconds: number) => {
    for (const sprite of spray) {
      const t = (seconds * .12 + sprite.userData.phase) % 1;
      sprite.position.set(sprite.userData.x + Math.sin(t * 5) * .6, .3 + t * 2.2, sprite.userData.z + t * 1.6);
    }
    for (const [i, ring] of rings.entries()) {
      const t = (seconds * .18 + i / rings.length) % 1;
      ring.scale.set(1 + t * 5, .65 + t * 3, 1); ring.material.opacity = (1 - t) * .09;
    }
  };
}
