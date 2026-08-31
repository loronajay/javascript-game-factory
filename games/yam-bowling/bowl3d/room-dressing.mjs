import * as THREE from './vendor/three.module.min.js';
import { createThemeTextures } from './theme-art.mjs';
import { tileBoxUVs } from './wall-material.mjs';
import { HEAD_Z, ROOM_LENGTH, ROOM_CENTER_Z, deckZ } from './geometry.mjs';

// Visual-only architecture outside the playable corridor. Geometry/materials
// are pooled for the room lifetime; choosing a house only repaints four maps.
export function createRoomDressing(scene, gpu, { textureFactory = createThemeTextures } = {}) {
  const art=textureFactory(gpu),group=new THREE.Group();group.name='house-dressing';scene.add(group);
  const standard=options=>new THREE.MeshStandardMaterial(options);
  const materials={
    mural:standard({ map:art.textures.mural,emissiveMap:art.textures.mural,emissive:0xffffff,roughness:.63 }),
    panels:standard({ map:art.textures.panels,emissiveMap:art.textures.panels,emissive:0xffffff,roughness:.58 }),
    floor:new THREE.MeshPhysicalMaterial({ map:art.textures.floor,roughness:.3,clearcoat:.45,clearcoatRoughness:.2,envMapIntensity:1.1 }),
    cladding:standard({ map:art.textures.cladding,roughness:.65 }),
    trim:standard({ metalness:.72,roughness:.28 }),
    upholstery:new THREE.MeshPhysicalMaterial({ roughness:.6,clearcoat:.16 }),
    piping:standard({ metalness:.25,roughness:.5 }),
    leaves:standard({ color:0x295039,roughness:.87,side:THREE.DoubleSide }),
    gold:standard({ color:0xdab061,metalness:.8,roughness:.24 }),
    lamp:standard({ color:0xffe2b5,emissive:0xffd799,emissiveIntensity:.8 }),
    neon:standard({ color:0,emissiveIntensity:1.2,toneMapped:false }),
  };
  function mesh(geometry,material,pos,name,parent=group,rotation=[0,0,0]) {
    const object=new THREE.Mesh(geometry,material);object.position.set(...pos);object.rotation.set(...rotation);
    object.name=name;object.receiveShadow=true;parent.add(object);return object;
  }
  function box(size,pos,material,name,parent=group,rotation) {
    let geometry;
    if(material===materials.upholstery) {
      const [w,h,d]=size,r=Math.min(.1,h/4,w/4,d/4),shape=new THREE.Shape();
      shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
      shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);
      shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
      shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
      geometry=new THREE.ExtrudeGeometry(shape,{depth:d-r,bevelEnabled:true,bevelThickness:r/2,bevelSize:r/2,bevelSegments:2,steps:1,curveSegments:3});
      geometry.translate(0,0,-(d-r)/2);
    } else geometry=new THREE.BoxGeometry(...size);
    if(material===materials.cladding) tileBoxUVs(geometry,3);
    return mesh(geometry,material,pos,name,parent,rotation);
  }
  const props={ trophies:new THREE.Group(),plants:new THREE.Group() };
  group.add(props.trophies,props.plants);
  const atlasGeometry=variant=>{
    const geometry=new THREE.PlaneGeometry(5.4,5.6),uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++) uv.setX(i,(uv.getX(i)+variant)/2);
    return geometry;
  };
  const panelGeometry=[atlasGeometry(0),atlasGeometry(1)];
  for(const side of [-1,1]) {
    box([.13,1.8,ROOM_LENGTH],[side*7.58,.45,ROOM_CENTER_Z],materials.cladding,'wainscot');
    box([.16,.07,ROOM_LENGTH],[side*7.49,1.4,ROOM_CENTER_Z],materials.trim,'chair-rail');
    box([.12,.09,ROOM_LENGTH],[side*7.5,7.6,ROOM_CENTER_Z],materials.neon,'ceiling-edge');
    for(let i=0,z=1;z>HEAD_Z-1;i++,z-=12) {
      box([.13,5.85,5.65],[side*7.53,4.35,z],materials.trim,'panel-frame');
      mesh(panelGeometry[i%2],materials.panels,[side*7.44,4.35,z],'wall-art',group,[0,-side*Math.PI/2,0]);
      // Small brass wall sconces, clear of the overhead follow-camera sightline.
      box([.34,.9,.34],[side*7.25,4.8,z-4.2],materials.trim,'sconce-mount');
      box([.39,.62,.25],[side*7.18,4.8,z-4.2],materials.lamp,'sconce-diffuser');
    }
    for(const z of [5.8,-34,HEAD_Z-3]) {
      const sofa=new THREE.Group();sofa.position.set(side*5.95,0,z);group.add(sofa);
      sofa.rotation.y=side*Math.PI/2;
      box([2.65,.36,2.7],[0,-.16,0],materials.trim,'sofa-base',sofa);
      box([2.5,.42,2.4],[0,.2,0],materials.upholstery,'sofa-seat',sofa);
      box([2.5,1.25,.38],[0,.76,.99],materials.upholstery,'sofa-back',sofa);
      for(const x of [-1.17,1.17]) box([.2,.72,2.5],[x,.46,0],materials.upholstery,'sofa-arm',sofa);
      for(const x of [-.8,0,.8]) box([.018,.97,.02],[x,.76,.786],materials.piping,'seat-seam',sofa);
    }
    for(const z of [-3.8,HEAD_Z+1]) {
      const plant=new THREE.Group();plant.position.set(side*5.75,-.45,z);props.plants.add(plant);
      mesh(new THREE.CylinderGeometry(.52,.43,1.1,6),materials.trim,[0,.55,0],'planter',plant);
      const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.55,.7,0,1.7);leafShape.quadraticCurveTo(-.3,.6,0,0);
      const geometry=new THREE.ShapeGeometry(leafShape);
      for(let i=0;i<9;i++) {
        const leaf=mesh(geometry,materials.leaves,[0,1,0],'plant-leaf',plant);
        leaf.rotation.set(.35+(i%3)*.24,i*2.4,.25);leaf.scale.setScalar(.72+(i%3)*.14);
      }
    }
    const cabinet=new THREE.Group();cabinet.position.set(side*7.08,2.75,-6);props.trophies.add(cabinet);
    box([.5,4.4,2.7],[0,0,0],materials.cladding,'cabinet-back',cabinet);
    for(const y of [-2.2,-.75,.75,2.2]) box([.85,.1,2.8],[-side*.14,y,0],materials.trim,'display-shelf',cabinet);
    for(const z of [-1.4,1.4]) box([.85,4.5,.09],[-side*.14,0,z],materials.trim,'display-frame',cabinet);
    for(const y of [-1.95,-.5,.95]) for(const z of [-.65,.65]) {
      box([.35,.16,.45],[-side*.33,y,z],materials.trim,'trophy-plinth',cabinet);
      mesh(new THREE.CylinderGeometry(.045,.075,.32,8),materials.gold,[-side*.33,y+.22,z],'trophy-stem',cabinet);
      mesh(new THREE.CylinderGeometry(.22,.08,.32,12),materials.gold,[-side*.33,y+.51,z],'trophy-cup',cabinet);
      mesh(new THREE.TorusGeometry(.2,.028,6,12),materials.gold,[-side*.33,y+.54,z],'trophy-handles',cabinet,[0,Math.PI/2,0]);
    }
  }
  // Above/behind the rack, never spanning the aiming or follow-camera corridor.
  box([15.2,4.15,.22],[0,5.65,deckZ(-6.4)],materials.trim,'mural-frame');
  mesh(new THREE.PlaneGeometry(14.85,3.85),materials.mural,[0,5.65,deckZ(-6.26)],'house-mural');
  let current='';
  return {
    group, materials, props,
    setTheme(theme) {
      if(current===theme.slug)return;
      current=theme.slug;group.userData.theme=theme.slug;art.paint(theme);
      for(const key of ['panels','mural']) materials[key].emissiveIntensity=theme.artGlow;
      materials.floor.roughness=theme.floorRoughness;
      materials.trim.color.setHex(theme.trim);materials.upholstery.color.setHex(theme.seat);
      materials.piping.color.setHex(theme.accent);
      materials.neon.emissive.setHex(theme.colors[1]);
      materials.lamp.color.setHex(theme.light);materials.lamp.emissive.setHex(theme.light);
      props.trophies.visible=theme.motif==='liberty'||theme.motif==='timber';
      props.plants.visible=theme.motif!=='liberty'&&theme.motif!=='timber';
    },
    dispose() {
      group.removeFromParent();const geometries=new Set();group.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);});
      for(const geometry of geometries)geometry.dispose();
      for(const material of Object.values(materials))material.dispose();art.dispose();
    },
  };
}
