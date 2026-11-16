import * as THREE from 'three';
import { clamp, lerp, smoothstep, rand, softCloudSprite } from './util.js';

const FLAME_VERT = `
varying vec2 vUv;
varying vec3 vP;
void main(){
  vUv = uv;
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLAME_FRAG = `
uniform float uTime, uOpacity, uCore;
uniform vec3 uColorA, uColorB, uColorC;
varying vec2 vUv;
varying vec3 vP;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
void main(){
  float n1 = vnoise(vec2(vUv.x * 9.0, vUv.y * 5.0 - uTime * 5.0));
  float n2 = vnoise(vec2(vUv.x * 23.0 + 7.3, vUv.y * 11.0 - uTime * 8.0));
  float along = smoothstep(0.0, 0.20, vUv.y) * (0.34 + 0.86 * pow(clamp(vUv.y, 0.0, 1.0), 1.35));
  float turb = 0.52 + 0.48 * n1 + 0.16 * n2;
  float diamonds = pow(0.5 + 0.5 * sin(vUv.y * 34.0 - uTime * 9.0 + n1 * 4.0), 6.0) * smoothstep(0.15, 0.95, vUv.y);
  vec3 col = mix(uColorC, uColorB, smoothstep(0.0, 0.55, vUv.y));
  col = mix(col, uColorA, smoothstep(0.60, 1.0, vUv.y) * uCore);
  col += vec3(0.95, 0.48, 0.16) * diamonds * (0.22 + 0.55 * uCore);
  float a = uOpacity * along * turb * (0.45 + 0.55 * uCore) * (0.78 + 0.30 * diamonds);
  gl_FragColor = vec4(col * (0.90 + 0.25 * vUv.y), a);
}
`;

const SMOKE_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (460.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const SMOKE_FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = smoothstep(1.0, 0.15, d);
  a *= smoothstep(0.0, 0.35, vAlpha) * vAlpha;
  gl_FragColor = vec4(vColor, a * 0.62);
}
`;

class SmokeSystem {
  constructor(scene, count, texture, renderOrder = 5) {
    this.count = count;
    this.cursor = 0;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size0 = new Float32Array(count);
    this.size1 = new Float32Array(count);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.peak = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    this.lifeAttr = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture } },
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, maxLife, size0, size1, peak, r, g, b) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = maxLife; this.maxLife[i] = maxLife;
    this.size0[i] = size0; this.size1[i] = size1;
    this.size[i] = size0; this.alpha[i] = 0; this.peak[i] = peak;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const j = i * 3;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.vel[j] *= 1 - dt * 0.5;
      this.vel[j + 1] += dt * 0.9;
      this.vel[j + 2] *= 1 - dt * 0.5;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * Math.pow(t, 0.55);
      this.alpha[i] = Math.pow(1 - t, 1.4) * this.peak[i] * smoothstep(0, 0.12, t);
      if (this.life[i] <= 0) this.alpha[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class Rocket {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'rocket';
    this.throttle = 0;
    this.vacuum = 0;
    this.time = 0;
    this.launched = false;
    this.flags = { boosters: false, stage: false, fairing: false, payload: false };
    this.debris = [];
    this.smokeAcc = 0;
    this.trailAcc = 0;
    this.smokeTex = softCloudSprite(128);
    this.groundSmoke = new SmokeSystem(scene, 900, this.smokeTex, 5);
    this.trailSmoke = new SmokeSystem(scene, 800, this.smokeTex, 6);
    this._materials();
    this._buildStack();
    this._buildBoosters();
    this._buildPlume();
    this._buildLights();
    scene.add(this.group);
  }

  _materials() {
    this.mWhite = new THREE.MeshStandardMaterial({ color: 0xd9dcd8, roughness: 0.50, metalness: 0.12, envMapIntensity: 0.85 });
    this.mWhite2 = new THREE.MeshStandardMaterial({ color: 0xc3c8c9, roughness: 0.54, metalness: 0.10 });
    this.mDark = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.58, metalness: 0.42 });
    this.mMetal = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.32, metalness: 0.82 });
    this.mRed = new THREE.MeshStandardMaterial({ color: 0xa9332a, roughness: 0.5, metalness: 0.2 });
    this.mGold = new THREE.MeshStandardMaterial({ color: 0xc7a45a, roughness: 0.35, metalness: 0.7 });
    this.mNozzle = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.85 });
  }

  _cyl(parent, rTop, rBottom, h, y, mat, seg = 32, open = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open), mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _cone(parent, r, h, y, mat, seg = 32) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg, 1, true), mat);
    m.position.y = y;
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  _box(parent, w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _buildStack() {
    const g = this.group;
    this.stack = new THREE.Group();
    g.add(this.stack);

    this.stage1Group = new THREE.Group();
    this.stack.add(this.stage1Group);
    const s1 = this.stage1Group;

    this._cyl(s1, 2.32, 2.58, 34.5, 19.4, this.mWhite, 40);
    this._cyl(s1, 2.58, 2.86, 3.1, 2.6, this.mDark, 40);
    for (const y of [8.2, 19.0, 30.2, 35.7]) {
      this._cyl(s1, 2.44, 2.44, 0.36, y, this.mDark, 40);
    }
    this._cyl(s1, 2.42, 2.42, 0.9, 36.1, this.mWhite2, 40);
    this._box(s1, 0.34, 30.0, 0.5, 2.2, 20.5, 0.9, this.mWhite2);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const fin = this._box(s1, 1.25, 2.1, 0.14, Math.cos(a) * 2.42, 33.6, Math.sin(a) * 2.42, this.mMetal);
      fin.rotation.y = -a;
    }
    for (let i = 0; i < 5; i++) {
      const a = i === 0 ? 0 : Math.PI / 2 * (i - 1) + Math.PI / 4;
      const r = i === 0 ? 0 : 1.45;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 1.32, 2.5, 24, 1, true), this.mNozzle);
      bell.position.set(Math.cos(a) * r, 0.0, Math.sin(a) * r);
      s1.add(bell);
    }
    this._cyl(s1, 2.32, 2.32, 3.2, 39.6, this.mDark, 40);
    this._cyl(s1, 2.32, 2.32, 2.4, 42.3, this.mWhite, 40);

    this.stage2Group = new THREE.Group();
    this.stack.add(this.stage2Group);
    const s2 = this.stage2Group;
    this._cyl(s2, 2.28, 2.32, 14.5, 50.2, this.mWhite, 40);
    this._cyl(s2, 2.3, 2.3, 0.5, 47.0, this.mDark, 40);
    this._cyl(s2, 2.3, 2.3, 0.5, 56.7, this.mDark, 40);
    this._box(s2, 0.26, 12.0, 0.4, 2.2, 50.5, 0.8, this.mWhite2);
    this._cyl(s2, 2.35, 2.2, 1.4, 58.2, this.mMetal, 40);

    this._buildFairing();
    this._buildPayload();
  }

  _buildFairing() {
    const mkHalf = (thetaStart) => {
      const g = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.76, 2.76, 7.0, 28, 1, true, thetaStart, Math.PI), this.mWhite);
      barrel.position.y = 3.5;
      barrel.castShadow = true;
      barrel.material = this.mWhite;
      g.add(barrel);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.76, 5.2, 28, 1, true, thetaStart, Math.PI), this.mWhite);
      cone.position.y = 9.6;
      cone.castShadow = true;
      g.add(cone);
      const seam = new THREE.Mesh(new THREE.CylinderGeometry(2.79, 2.79, 0.28, 28, 1, true, thetaStart + 0.02, Math.PI - 0.04), this.mDark);
      seam.position.y = 6.9;
      g.add(seam);
      return g;
    };
    this.fairingL = mkHalf(0);
    this.fairingR = mkHalf(Math.PI);
    this.fairingL.position.y = 58.5;
    this.fairingR.position.y = 58.5;
    this.fairingL.userData.base = new THREE.Vector3(0, 58.5, 0);
    this.fairingR.userData.base = new THREE.Vector3(0, 58.5, 0);
    this.stack.add(this.fairingL, this.fairingR);
  }

  _buildPayload() {
    const g = new THREE.Group();
    g.position.y = 60.0;
    const bus = this._box(g, 1.5, 1.7, 1.5, 0, 0.9, 0, this.mGold);
    for (const sx of [-1, 1]) {
      const panel = this._box(g, 0.08, 1.5, 2.6, sx * 0.8, 0.95, 0, this.mDark);
      panel.userData.panel = true;
    }
    this._cyl(g, 0.12, 0.12, 2.4, 0.2, this.mMetal, 8).rotation.z = Math.PI / 2;
    g.scale.setScalar(1.45);
    this.payload = g;
    this.payload.visible = true;
    this.stack.add(g);
  }

  _buildBoosters() {
    this.boosters = [];
    this.boosterContainer = new THREE.Group();
    this.stage1Group.add(this.boosterContainer);
    const angles = [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4];
    for (const a of angles) {
      const b = new THREE.Group();
      const r = 4.22;
      b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this._cyl(b, 1.52, 1.62, 24.5, 11.5, this.mWhite, 28);
      this._cyl(b, 1.64, 1.78, 2.4, 0.2, this.mDark, 28);
      this._cyl(b, 1.55, 1.55, 0.34, 20.6, this.mDark, 28);
      this._cone(b, 1.55, 6.1, 26.9, this.mWhite, 28);
      this._box(b, 0.1, 14.0, 0.34, Math.cos(a) * 1.58, 11.0, Math.sin(a) * 1.58, this.mWhite2);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.95, 1.6, 20, 1, true), this.mNozzle);
      bell.position.y = -1.55;
      b.add(bell);
      b.userData.outward = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const flame = this._makePlume(0.95, 7.2, 1.0, 0.55);
      flame.position.y = -1.9;
      flame.visible = false;
      b.add(flame);
      b.userData.flame = flame;
      this.boosterContainer.add(b);
      this.boosters.push(b);
    }
  }

  _makePlume(rad, len, core, opacity, blending = THREE.NormalBlending) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: 0 }, uCore: { value: core },
        uColorA: { value: new THREE.Color('#fff4d8') },
        uColorB: { value: new THREE.Color('#ff8a3a') },
        uColorC: { value: new THREE.Color('#c93410') },
      },
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
      transparent: true, blending, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.52, rad, len, 26, 1, true), mat);
    mesh.position.y = -len / 2;
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.userData.baseOpacity = opacity;
    return mesh;
  }

  _buildPlume() {
    this.plume = new THREE.Group();
    this.plume.position.y = -1.9;
    this.group.add(this.plume);
    this.flameOuter = this._makePlume(7.4, 19.0, 0.0, 0.95, THREE.NormalBlending);
    this.flameInner = this._makePlume(2.7, 9.0, 1.0, 0.85, THREE.AdditiveBlending);
    this.flameOuter.position.y = -9.4;
    this.flameInner.position.y = -4.4;
    this.plume.add(this.flameOuter, this.flameInner);
    this.shock = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.shock.position.y = -2.9;
    this.shock.scale.set(1, 1.6, 1);
    this.plume.add(this.shock);

    this.plumeSmoke = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softCloudSprite(128), color: 0x54585c, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false,
      }));
      s.position.y = -6.0 - i * 8.5;
      s.scale.setScalar(18 + i * 9);
      s.renderOrder = 7;
      this.plume.add(s);
      this.plumeSmoke.push(s);
    }

    this.plume2 = new THREE.Group();
    this.plume2.position.y = 39.4;
    this.stage2Group.add(this.plume2);
    this.flame2 = this._makePlume(2.7, 12.0, 0.6, 0.85, THREE.NormalBlending);
    this.flame2.position.y = -5.4;
    this.plume2.add(this.flame2);
    this.plume2.visible = false;
    this.plume.visible = false;
  }

  _buildLights() {
    this.engineLight = new THREE.PointLight(0xff8438, 0, 280, 2.0);
    this.engineLight.position.y = -5.5;
    this.group.add(this.engineLight);
    const tex = softCloudSprite(128);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xffa04a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glow.position.y = -4.5;
    this.glow.scale.setScalar(34);
    this.glow.material.depthTest = false;
    this.glow.renderOrder = 9;
    this.group.add(this.glow);
    this.padSplash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softCloudSprite(128), color: 0xff8a30, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    this.padSplash.position.set(0, 3.4, 0);
    this.padSplash.scale.set(96, 58, 1);
    this.padSplash.renderOrder = 7;
    this.scene.add(this.padSplash);
    this.padFire = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softCloudSprite(128), color: 0xff7a22, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    this.padFire.position.set(0, 9.5, 0);
    this.padFire.scale.set(46, 32, 1);
    this.padFire.renderOrder = 9;
    this.scene.add(this.padFire);

    this.padJets = [];
    const jetTex = softCloudSprite(128);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const jet = new THREE.Sprite(new THREE.SpriteMaterial({
        map: jetTex, color: i % 2 ? 0xffb15c : 0xff6a20, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }));
      jet.position.set(Math.cos(a) * 8.5, 17 + (i % 3) * 3.0, Math.sin(a) * 8.5);
      jet.scale.setScalar(16 + (i % 4) * 4);
      jet.renderOrder = 8;
      this.scene.add(jet);
      this.padJets.push(jet);
    }

    this.trenchFlames = [];
    for (const sz of [-1, 1]) {
      const f = this._makePlume(4.0, 24.0, 0.05, 0.72, THREE.NormalBlending);
      f.position.set(0, 3.6, sz * 66);
      f.rotation.x = sz > 0 ? Math.PI / 2 : -Math.PI / 2;
      f.visible = false;
      this.scene.add(f);
      f.visible = false; // 导流槽火焰在实拍中像橙色管道，关闭
      this.trenchFlames.push(f);
    }
  }

  ignite() {
    this.launched = true;
    for (let i = 0; i < 80; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * 18;
      this.groundSmoke.spawn(
        Math.cos(a) * r, 2 + rand() * 7, Math.sin(a) * r,
        Math.cos(a) * (10 + rand() * 24), 2.5 + rand() * 8, Math.sin(a) * (10 + rand() * 24),
        4.0 + rand() * 5.0, 6.0, 24 + rand() * 30, 0.44,
        0.78 + rand() * 0.12, 0.74 + rand() * 0.12, 0.70 + rand() * 0.10
      );
    }
  }

  setThrottle(v) { this.throttle = clamp(v, 0, 1.05); }

  separateBoosters() {
    if (this.flags.boosters) return;
    this.flags.boosters = true;
    for (const b of this.boosters) {
      const wp = new THREE.Vector3();
      b.getWorldPosition(wp);
      this.scene.attach(b);
      b.userData.vel = b.userData.outward.clone().multiplyScalar(16 + rand() * 5);
      b.userData.vel.y = 26 + rand() * 8;
      b.userData.spin = new THREE.Vector3((rand() - 0.5) * 2.6, (rand() - 0.5) * 2.0, (rand() - 0.5) * 2.6);
      if (b.userData.flame) b.userData.flame.visible = false;
      this.debris.push(b);
      this._burst(wp, 26, 5);
    }
  }

  separateStage() {
    if (this.flags.stage) return;
    this.flags.stage = true;
    const wp = new THREE.Vector3();
    this.stage1Group.getWorldPosition(wp);
    this.scene.attach(this.stage1Group);
    this.stage1Group.userData.vel = new THREE.Vector3(0, 16, 0);
    this.stage1Group.userData.spin = new THREE.Vector3(0.16, 0.05, -0.3);
    this.debris.push(this.stage1Group);
    this.plume2.visible = true;
    this._burst(wp.clone().add(new THREE.Vector3(0, 36, 0)), 40, 8);
  }

  releaseFairing() {
    if (this.flags.fairing) return;
    this.flags.fairing = true;
    for (const [h, sign] of [[this.fairingL, 1], [this.fairingR, -1]]) {
      h.userData.open = 0;
      h.userData.sign = sign;
    }
    this._burst(this.group.position.clone().add(new THREE.Vector3(0, 66, 0)), 18, 4);
  }

  releasePayload() {
    if (this.flags.payload) return;
    this.flags.payload = true;
    const wp = new THREE.Vector3();
    this.payload.getWorldPosition(wp);
    this.scene.attach(this.payload);
    this.payload.userData.vel = new THREE.Vector3(0.8, 2.0, 0.5);
    this.payload.userData.spin = 0.12;
    this.payload.userData.free = true;
    this.debris.push(this.payload);
  }

  _burst(pos, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const s = rand() * spread;
      const v = rand();
      this.trailSmoke.spawn(
        pos.x + Math.cos(a) * v * 3, pos.y + (rand() - 0.5) * 4, pos.z + Math.sin(a) * v * 3,
        Math.cos(a) * s, (rand() - 0.3) * 9, Math.sin(a) * s,
        2.2 + rand() * 2.4, 2.5, 16 + rand() * 12, 0.55,
        0.72, 0.72, 0.74
      );
    }
  }

  update(dt, st) {
    this.time += dt;
    this.vacuum = st.vacuum ?? 0;
    const th = this.throttle;
    this.group.rotation.z = st.tilt ?? 0;
    this.plume.visible = th > 0.02 && !this.flags.stage;
    this.plume2.visible = this.flags.stage && th > 0.02;
    const flick = 0.92 + 0.08 * Math.sin(this.time * 53.0);
    const spaceStretch = 1 + this.vacuum * 0.9;

    for (const p of [this.flameOuter, this.flameInner]) {
      const u = p.material.uniforms;
      u.uTime.value = this.time;
      const base = p === this.flameOuter ? 0.98 : 0.85;
      u.uOpacity.value = th * base * flick * (1 - this.vacuum * 0.18);
      if (p === this.flameOuter) p.scale.set(1 + this.vacuum * 1.35, spaceStretch, 1 + this.vacuum * 1.35);
    }
    this.flame2.material.uniforms.uTime.value = this.time;
    this.flame2.material.uniforms.uOpacity.value = th * 0.9 * flick * 0.7;
    this.flame2.scale.set(1 + this.vacuum * 1.7, 1 + this.vacuum * 1.3, 1 + this.vacuum * 1.7);
    const smokeOn = th * (1 - this.vacuum) * (st.alt > 18 ? 1 : 0.15);
    for (let i = 0; i < this.plumeSmoke.length; i++) {
      const s = this.plumeSmoke[i];
      s.material.opacity = smokeOn * (0.42 - i * 0.055) * (0.8 + 0.2 * Math.sin(this.time * 7.0 + i));
      s.scale.setScalar((19 + i * 9) * (0.92 + 0.08 * Math.sin(this.time * 5.0 + i)));
    }
    this.shock.material.opacity = th * 0.5 * (1 - this.vacuum * 0.6) * (0.6 + 0.4 * Math.sin(this.time * 26));
    this.shock.scale.set(1 + this.vacuum, 1.6, 1 + this.vacuum);

    for (const b of this.boosters) {
      if (b.userData.flame) {
        b.userData.flame.visible = th > 0.02 && !this.flags.boosters;
        const u = b.userData.flame.material.uniforms;
        u.uTime.value = this.time;
        u.uOpacity.value = th * 0.5 * flick;
      }
    }

    this.engineLight.intensity = th * (92 + 26 * Math.sin(this.time * 18)) * (1 - this.vacuum * 0.45);
    this.engineLight.color.setHex(this.vacuum > 0.5 ? 0xff9a5a : 0xff8438);
    this.glow.material.opacity = th * 0.55 * (1 - this.vacuum * 0.6);
    this.glow.scale.setScalar(20 + th * 9 + this.vacuum * 26);
    const splashOn = this.launched && st.alt < 120 ? th * (1 - smoothstep(12, 120, st.alt)) : 0;
    this.padSplash.material.opacity = splashOn * 0.72;
    this.padSplash.scale.set(96 + th * 28, 58 + th * 18, 1);
    const fireOn = this.launched && st.alt < 160 ? th * (1 - smoothstep(20, 160, st.alt)) : 0;
    this.padFire.material.opacity = fireOn * 0.9;
    this.padFire.scale.set(40 + th * 18, 28 + th * 14, 1);
    for (let i = 0; i < this.padJets.length; i++) {
      const jet = this.padJets[i];
      const pulse = 0.72 + 0.28 * Math.sin(this.time * 10.0 + i * 1.7);
      jet.material.opacity = fireOn * 0.82 * pulse;
      jet.scale.setScalar((16 + (i % 4) * 4) * (0.8 + th * 0.35) * pulse);
    }
    const trenchOn = false;
    for (const f of this.trenchFlames) {
      f.visible = trenchOn;
      if (trenchOn) {
        const u = f.material.uniforms;
        u.uTime.value = this.time;
        u.uOpacity.value = th * (1 - smoothstep(40, 220, st.alt)) * 0.9 * flick;
      }
    }

    if (th > 0.02 && this.launched) {
      const alt = st.alt ?? 0;
      this.smokeAcc += dt * (28 + th * 40);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const a = rand() * Math.PI * 2;
        const r = 2 + rand() * 10;
        const side = rand() < 0.5 ? -1 : 1;
        const px = Math.cos(a) * r + (rand() < 0.4 ? side * 13 : 0);
        const pz = Math.sin(a) * r + (rand() - 0.5) * 12;
        this.groundSmoke.spawn(
          px, 3 + rand() * 3, pz,
          Math.cos(a) * (6 + rand() * 16), 1.5 + rand() * 5.5, Math.sin(a) * (6 + rand() * 16),
          3.5 + rand() * 4.5, 5, 26 + rand() * 30, 0.5,
          0.62 + rand() * 0.1, 0.60 + rand() * 0.1, 0.58 + rand() * 0.1
        );
      }
      if (alt > 26) {
        this.trailAcc += dt * 150;
        const nozzle = new THREE.Vector3(0, -4.5, 0).applyQuaternion(this.group.quaternion).add(this.group.position);
        const back = new THREE.Vector3(0, -1, 0).applyQuaternion(this.group.quaternion);
        while (this.trailAcc > 1) {
          this.trailAcc -= 1;
          const a = rand() * Math.PI * 2;
          const spread = 2.5 + rand() * 6.0;
          this.trailSmoke.spawn(
            nozzle.x + Math.cos(a) * spread, nozzle.y + (rand() - 0.5) * 5, nozzle.z + Math.sin(a) * spread,
            back.x * (22 + rand() * 24) + Math.cos(a) * 3.5, back.y * (22 + rand() * 24), back.z * (22 + rand() * 24) + Math.sin(a) * 3.5,
            3.6 + rand() * 5.0, 3.0, 16 + rand() * 18, 0.5,
            0.74, 0.72, 0.70
          );
        }
      }
    }

    for (const [h, sign] of [[this.fairingL, 1], [this.fairingR, -1]]) {
      if (h.userData.open !== undefined && this.flags.fairing && h.userData.open < 1) {
        h.userData.open = Math.min(1, h.userData.open + dt * 0.5);
        const k = 1 - Math.pow(1 - h.userData.open, 3);
        const baseY = h.userData.base ? h.userData.base.y : 58.5;
        h.position.set(sign * k * 13, baseY + k * 4, -k * 2);
        h.rotation.z = -sign * k * 0.55;
        h.rotation.y = sign * k * 0.22;
        if (h.userData.open >= 1) h.visible = false;
      }
    }

    for (const d of this.debris) {
      if (!d.userData.vel) continue;
      d.position.addScaledVector(d.userData.vel, dt);
      d.userData.vel.y -= dt * 7.5;
      if (d.userData.spin) {
        d.rotation.x += d.userData.spin.x * dt;
        d.rotation.y += d.userData.spin.y * dt;
        d.rotation.z += d.userData.spin.z * dt;
      } else if (d.userData.free) {
        d.rotation.y += d.userData.spin * dt;
      }
    }

    this.groundSmoke.update(dt);
    this.trailSmoke.update(dt);
  }

  dispose() {
    const kill = (obj) => {
      obj.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    };
    kill(this.group);
    kill(this.payload);
    kill(this.groundSmoke.points);
    kill(this.trailSmoke.points);
    kill(this.padSplash);
    kill(this.padFire);
    for (const j of this.padJets) kill(j);
    for (const f of this.trenchFlames) kill(f);
    for (const d of this.debris) if (d.parent) d.parent.remove(d);
    this.scene.remove(this.group);
  }
}
