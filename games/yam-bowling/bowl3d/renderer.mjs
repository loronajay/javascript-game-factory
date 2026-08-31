import * as THREE from './vendor/three.module.min.js';
import { createRoom } from './room.mjs';
import { PIN_PROFILE, PIN_SHAPES, PIN_COM, PIN_POSITIONS, LANE_TOP, BALL_RADIUS,
  HEAD_Z, SHOT_X_SCALE, worldZ } from './geometry.mjs';
import { AimGuide } from './aim-guide.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function radiusAt(y) {
  for (let i=1; i<PIN_PROFILE.length; i++) {
    const [r0,y0] = PIN_PROFILE[i-1], [r1,y1] = PIN_PROFILE[i];
    if (y <= y1) return r0+(r1-r0)*(y-y0)/(y1-y0);
  }
  return 0;
}
const lathe = profile => new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)),24);

// Drawing only. Camera smoothing advances in tick(), never in render(). The
// existing character loader owns the five throw images and their outfit paths.
export class Bowling3dRenderer {
  constructor({ canvas, classicRenderer, physics, laneCore, effects, balls }) {
    this.canvas = canvas; this.classic = classicRenderer; this.physics = physics;
    this.laneCore = laneCore; this.effects = effects; this.balls = balls;
    this.gpu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.gpu.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
    this.gpu.shadowMap.enabled = true; this.gpu.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gpu.outputColorSpace = THREE.SRGBColorSpace;
    this.gpu.toneMapping = THREE.ACESFilmicToneMapping; this.gpu.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.room = createRoom(this.scene,this.gpu);
    this.camera = new THREE.PerspectiveCamera(44,1,.1,200);
    this.camera.position.set(0,7.6,18.5); this.target = new THREE.Vector3(0,.8,worldZ(.20));
    this.camera.lookAt(this.target); this.cameraMode = 'follow';
    this.pinGeometry = lathe(PIN_PROFILE);
    this.pinWhite = new THREE.MeshPhysicalMaterial({ color: 0xf8f6ef, roughness: .24, clearcoat: .32 });
    this.pinRed = new THREE.MeshStandardMaterial({ color: 0xb91f2c, roughness: .3 });
    this.stripes = [[1.205,1.255],[1.285,1.335]].map(([a,b]) => lathe(
      Array.from({length:6},(_,i) => { const y=a+(b-a)*i/5; return [radiusAt(y)+.004,y]; })));
    this.pins = new Map();
    for (let id=1; id<=10; id++) {
      const group = new THREE.Group();
      for (const [geometry,material] of [[this.pinGeometry,this.pinWhite],...this.stripes.map(g=>[g,this.pinRed])]) {
        const mesh = new THREE.Mesh(geometry,material); mesh.position.y=-PIN_COM;
        mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
      }
      this.scene.add(group); this.pins.set(id,group);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS,28,20),
      new THREE.MeshPhysicalMaterial({ color: balls[0].a, roughness: .2, metalness: .25, clearcoat: .7 }));
    this.ball.castShadow=true;
    const holeGeometry = new THREE.SphereGeometry(.054,10,8);
    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x08090b });
    for (const p of [[.15,.18,.46],[-.10,.24,.45],[.05,.38,.35]]) {
      const hole = new THREE.Mesh(holeGeometry,holeMaterial); hole.position.set(...p); this.ball.add(hole);
    }
    this.scene.add(this.ball);
    this.bowlerMaterial = new THREE.SpriteMaterial({ transparent: true, alphaTest: .04, depthWrite: false });
    this.bowler = new THREE.Sprite(this.bowlerMaterial); this.bowler.center.set(.5,0); this.scene.add(this.bowler);
    this.frames = null; this.textures = [];
    this.guide = new AimGuide(this.scene, physics);
    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(256*3),3));
    particlesGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(256*3),3));
    this.particles = new THREE.Points(particlesGeometry,new THREE.PointsMaterial({ size: .18, vertexColors: true,
      transparent: true, opacity: .65, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.particles);
    this.flash = new THREE.Mesh(new THREE.RingGeometry(.92,1,40),new THREE.MeshBasicMaterial({
      color: 0xffe7a0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.flash.rotation.x=-Math.PI/2; this.flash.position.set(0,LANE_TOP+.04,HEAD_Z); this.scene.add(this.flash);
    this.debugGeometry = new THREE.SphereGeometry(1,10,6);
    this.debugMaterial = new THREE.MeshBasicMaterial({ color: 0x45ff7a, wireframe: true, depthTest: false });
    this.debugGroup = new THREE.Group(); this.scene.add(this.debugGroup);
    // Green wireframes match the compound spheres used by the physical pins.
    this.debugPins = new Map();
    this.sizeKey = ''; this.contextLost = false;
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; });
  }

  tick(scene, dt, reducedMotion) {
    const sim = scene.simulation?.threeD ? scene.simulation : null;
    const following = this.cameraMode === 'follow' && !reducedMotion && sim && ['deck','transition'].includes(scene.phase);
    const pos = following ? sim.body.position : null;
    const destination = new THREE.Vector3(pos ? clamp(pos.x*.1,-.4,.4) : 0, pos ? 6.6 : 7.6,
      pos ? clamp(pos.z+18,HEAD_Z+14,18.5) : 18.5);
    const target = new THREE.Vector3(pos ? pos.x*.12 : 0,.8,
      pos ? clamp(pos.z-8,HEAD_Z-3,worldZ(.20)) : worldZ(.20));
    this.camera.position.lerp(destination,Math.min(1,dt*2)); this.target.lerp(target,Math.min(1,dt*3));
    this.camera.lookAt(this.target);
  }

  updateBowler(scene) {
    const frames = this.classic.assets.character;
    if (frames !== this.frames) {
      this.textures.forEach(texture => texture.dispose()); this.frames=frames;
      this.textures=frames.map(image => { const texture=new THREE.Texture(image); texture.colorSpace=THREE.SRGBColorSpace;
        texture.needsUpdate=true; return texture; });
    }
    if (!this.textures.length) return;
    const rolling = ['deck','approach','transition'].includes(scene.phase);
    const frame = rolling ? clamp(Math.floor(scene.throwElapsed/.14),0,4) : 0;
    const texture = this.textures[frame];
    this.bowlerMaterial.map=texture;
    const height=4.4, aspect=texture.image.width/texture.image.height;
    this.bowler.scale.set(height*aspect,height,1);
    this.bowler.position.set(scene.liveShot.position*SHOT_X_SCALE,LANE_TOP+.015,8.75-(rolling?Math.min(1,scene.throwElapsed/.56)*.72:0));
  }

  updateEffects(state) {
    const pos=this.particles.geometry.attributes.position, col=this.particles.geometry.attributes.color;
    const color=new THREE.Color(); let count=0;
    for (const p of [...(state?.trail||[]),...(state?.burst||[])]) {
      if (count>=256) break;
      const alpha=this.effects.particleAlpha(p); if (alpha<=0) continue;
      pos.setXYZ(count,p.x*3,LANE_TOP+.14,worldZ(p.z));
      color.set(p.color).multiplyScalar(alpha); col.setXYZ(count,color.r,color.g,color.b); count++;
    }
    pos.needsUpdate=true; col.needsUpdate=true; this.particles.geometry.setDrawRange(0,count);
    const life=(state?.flash||0)/this.effects.FLASH_LIFE;
    this.flash.visible=life>0; this.flash.material.opacity=life*.5; this.flash.scale.setScalar(1+(1-life)*2);
  }

  render(scene, effectsState, { laneSlug, debug = false } = {}) {
    if (this.contextLost) return;
    const rect=this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const width=Math.round(rect.width), height=Math.round(rect.height), sizeKey=`${width}:${height}`;
    if (sizeKey!==this.sizeKey) {
      this.sizeKey=sizeKey; this.gpu.setSize(width,height,false);
      this.camera.aspect=width/height; this.camera.fov=width/height<.9?54:44; this.camera.updateProjectionMatrix();
    }
    const lane=this.laneCore.getLane(laneSlug); this.room.setTheme(lane.slug,lane.name);
    const sim=scene.simulation?.threeD ? scene.simulation : null;
    for (const mesh of this.pins.values()) mesh.visible=false;
    if (sim) for (const entry of sim.entries) {
      const mesh=this.pins.get(entry.id); mesh.visible=true;
      mesh.position.copy(entry.body.position); mesh.quaternion.copy(entry.body.quaternion);
    } else for (const pin of scene.pins.filter(p=>p.standing)) {
      const mesh=this.pins.get(pin.id), [x,z]=PIN_POSITIONS[pin.id-1]; mesh.visible=true;
      mesh.position.set(x,LANE_TOP+PIN_COM,z); mesh.quaternion.identity();
    }
    this.ball.visible=Boolean(sim?.ball.active);
    if (this.ball.visible) { this.ball.position.copy(sim.body.position); this.ball.quaternion.copy(sim.body.quaternion); }
    this.ball.material.color.set(this.balls[(scene.shot||scene.liveShot).ballIndex||0].a);
    this.updateBowler(scene); this.guide.update(scene,this.camera,height); this.updateEffects(effectsState);
    // The active ball's collision radius is exact; pin shells follow their
    // compound bodies. Keeping the overlay local avoids touching the 2D one.
    this.debugGroup.visible=debug;
    if (debug && !this.debugBall) {
      this.debugBall=new THREE.Mesh(this.debugGeometry,this.debugMaterial); this.debugBall.scale.setScalar(BALL_RADIUS);
      this.debugGroup.add(this.debugBall);
      for (const [id] of this.pins) {
        const group = new THREE.Group();
        for (const [y,r] of PIN_SHAPES) {
          const sphere = new THREE.Mesh(this.debugGeometry,this.debugMaterial);
          sphere.position.y = y-PIN_COM; sphere.scale.setScalar(r); group.add(sphere);
        }
        const base = new THREE.Mesh(new THREE.BoxGeometry(.25,.11,.25),this.debugMaterial);
        base.position.y=.06-PIN_COM; group.add(base);
        this.debugGroup.add(group); this.debugPins.set(id,group);
      }
    }
    if (this.debugBall) { this.debugBall.visible=this.ball.visible; this.debugBall.position.copy(this.ball.position); }
    if (debug) for (const [id,group] of this.debugPins) {
      const mesh=this.pins.get(id); group.visible=mesh.visible;
      group.position.copy(mesh.position); group.quaternion.copy(mesh.quaternion);
    }
    this.gpu.render(this.scene,this.camera);
  }
}
