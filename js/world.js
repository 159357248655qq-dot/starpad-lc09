import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeSprite } from './util.js';
import { SKY_VERT, SKY_FRAG, BEAM_VERT, BEAM_FRAG } from './shaders.js';
import { buildEarth } from './earth.js';

const TAU = Math.PI * 2;

function hash3i(i, j, k) {
  let n = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
function vnoise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c000 = hash3i(i, j, k), c100 = hash3i(i + 1, j, k);
  const c010 = hash3i(i, j + 1, k), c110 = hash3i(i + 1, j + 1, k);
  const c001 = hash3i(i, j, k + 1), c101 = hash3i(i + 1, j, k + 1);
  const c011 = hash3i(i, j + 1, k + 1), c111 = hash3i(i + 1, j + 1, k + 1);
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}
function fbm3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x * f, y * f, z * f); f *= 2.02; a *= 0.5; }
  return s;
}
function fbm2(x, y, oct = 4) { return fbm3(x, y, 0.37, oct); }

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.night = false;
    this.nightMix = 0;
    this.space = 0;
    this.reveal = 0;
    this.time = 0;
    this.orbit = false;
    this.sunDir = new THREE.Vector3(-0.58, 0.27, 0.76).normalize();
    this.moonDir = new THREE.Vector3(0.42, 0.55, -0.72).normalize();
    this.mountains = [];
    this._buildLights();
    this._buildEnvironment();
    this._buildSky();
    this._buildTerrain();
    this.earthRig = buildEarth(scene, this.sunDir, renderer);
    this._buildFloodlights();
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x9fc2e8, 0x4a3f34, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd3a2, 3.1);
    this.sun.position.copy(this.sunDir).multiplyScalar(420);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -150; sc.right = 150; sc.top = 175; sc.bottom = -140; sc.near = 10; sc.far = 900;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.5;
    this.sun.target.position.set(0, 30, 0);
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0x5878a8, 0.5);
    this.fill.position.set(180, 90, -220);
    this.scene.add(this.fill);
    this.ambient = new THREE.AmbientLight(0x2a3540, 0.22);
    this.scene.add(this.ambient);
  }

  _buildEnvironment() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#6d93c7'); g.addColorStop(0.42, '#cf9d78');
    g.addColorStop(0.52, '#f3b184'); g.addColorStop(0.6, '#544a3f');
    g.addColorStop(1, '#1c1a18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    const rg = ctx.createRadialGradient(192, 62, 0, 192, 62, 26);
    rg.addColorStop(0, 'rgba(255,240,210,1)'); rg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = rg; ctx.fillRect(150, 28, 100, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromEquirectangular(tex).texture;
    this.scene.environment = this.envMap;
    tex.dispose(); pmrem.dispose();
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(9500, 40, 24);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color('#38699f') },
        uHorizon: { value: new THREE.Color('#f0a06a') },
        uGround: { value: new THREE.Color('#4b423a') },
        uSunColor: { value: new THREE.Color('#ffd2a0') },
        uNightColor: { value: new THREE.Color('#050a14') },
        uSunDir: { value: this.sunDir.clone() },
        uGalactic: { value: new THREE.Vector3(0.36, 0.82, 0.44).normalize() },
        uNight: { value: 0 }, uSpace: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0xd09a72, 0.00055);
    this.scene.background = new THREE.Color(0x0a0d12);
  }

  _buildTerrain() {
    const size = 7600, seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const flat = smoothstep(80, 360, r);
      const n1 = fbm2(x * 0.0032 + 4.1, z * 0.0032 + 9.3, 4) - 0.5;
      const n2 = fbm2(x * 0.019 + 1.7, z * 0.019 + 2.3, 3) - 0.5;
      pos.setY(i, (n1 * 72 + n2 * 5.2) * flat);
      const scrub = fbm2(x * 0.006 + 8.0, z * 0.006 + 3.0, 3);
      const dry = fbm2(x * 0.03 + 3.0, z * 0.03 + 5.0, 2);
      c.setRGB(
        0.145 + scrub * 0.10 + dry * 0.045,
        0.135 + scrub * 0.085 + dry * 0.03,
        0.105 + scrub * 0.055 + dry * 0.02
      );
      if (r < 112) c.setRGB(0.13, 0.124, 0.112);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.97, metalness: 0.0, envMapIntensity: 0.35,
    }));
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    for (const [radius, height, color] of [[2700, 160, 0x2c3036], [3200, 255, 0x222830]]) {
      const segs = 220;
      const positions = [], indices = [], cols = [];
      const col = new THREE.Color(color);
      for (let i = 0; i <= segs; i++) {
        const a = i / segs * TAU;
        const wob = fbm2(Math.cos(a) * 3.2 + radius * 0.001, Math.sin(a) * 3.2, 4);
        const h = height * (0.26 + wob * 0.95);
        const r1 = radius - 180, r2 = radius, r3 = radius + 280;
        positions.push(Math.cos(a) * r1, 0, Math.sin(a) * r1);
        positions.push(Math.cos(a) * r2, h, Math.sin(a) * r2);
        positions.push(Math.cos(a) * r3, 0, Math.sin(a) * r3);
        const shade = 0.72 + wob * 0.42;
        for (let k = 0; k < 3; k++) cols.push(col.r * shade, col.g * shade, col.b * shade);
        if (i < segs) {
          const i0 = i * 3;
          indices.push(i0, i0 + 1, i0 + 3, i0 + 1, i0 + 4, i0 + 3);
          indices.push(i0 + 1, i0 + 2, i0 + 4, i0 + 2, i0 + 5, i0 + 4);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 1.0, metalness: 0, flatShading: true,
      }));
      mesh.position.y = -2;
      this.scene.add(mesh);
      this.mountains.push(mesh);
    }
  }

  _buildFloodlights() {
    this.spots = [];
    const lampPos = [[36.8, 29.4, 36.8], [-36.8, 29.4, 36.8], [36.8, 29.4, -36.8], [-36.8, 29.4, -36.8]];
    for (const p of lampPos) {
      const s = new THREE.SpotLight(0xffd7a4, 0, 230, 0.55, 0.7, 1.5);
      s.position.set(...p);
      s.target.position.set(0, 20, 0);
      this.scene.add(s, s.target);
      this.spots.push(s);
    }
    this.beams = [];
    for (const p of lampPos) {
      const target = new THREE.Vector3(0, 15, 0);
      const lamp = new THREE.Vector3(...p);
      const dir = lamp.clone().sub(target);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(0.5, 16.0, len, 24, 1, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#ffd9a8') } },
        vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(target).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.beams.push(mesh);
    }
    this.spriteTex = makeSprite(128, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,235,200,.8)'], [1, 'rgba(255,200,140,0)']]);
    this.glows = [];
    const glowSpecs = [
      [-26, 101, -1, 4.0, '#ff5a3a'],
      [10.8, 108.4, 61.1, 3.4, '#ff5a3a'], [-58.3, 108.4, 21.2, 3.4, '#ff5a3a'], [47.5, 108.4, -39.9, 3.4, '#ff5a3a'],
      [36.8, 29.4, 36.8, 5.0, '#ffd9a0'], [-36.8, 29.4, 36.8, 5.0, '#ffd9a0'], [36.8, 29.4, -36.8, 5.0, '#ffd9a0'], [-36.8, 29.4, -36.8, 5.0, '#ffd9a0'],
      [6, 92.5, -213, 3.0, '#ff5a3a'], [32, 92.5, -213, 3.0, '#ff5a3a'],
    ];
    for (const [x, y, z, s, c] of glowSpecs) {
      const mat = new THREE.SpriteMaterial({ map: this.spriteTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      sp.scale.setScalar(s);
      this.scene.add(sp);
      this.glows.push(sp);
    }
  }

  setNight(on) { this.night = on; }

  update(dt, st) {
    this.time += dt;
    const cam = st.camera;
    this.nightMix = lerp(this.nightMix, this.night ? 1 : 0, 1 - Math.exp(-dt * 2.2));
    this.space = st.space ?? 0;
    this.reveal = st.reveal ?? 0;
    this.orbit = !!st.orbit;
    const nm = this.nightMix;
    const space = this.space;

    const u = this.skyMat.uniforms;
    u.uTime.value = this.time;
    u.uNight.value = nm;
    u.uSpace.value = space;
    u.uStars.value = clamp(Math.max(nm * 0.95, space * 1.15), 0, 1.4);
    u.uSunColor.value.copy(new THREE.Color('#ffd2a0').lerp(new THREE.Color('#9fb8e8'), nm));
    u.uNightColor.value.setRGB(0.006 + 0.02 * nm, 0.012 + 0.028 * nm, 0.028 + 0.05 * nm);
    u.uSunDir.value.copy(this.sunDir).lerp(this.moonDir, nm).normalize();
    this.sky.position.copy(cam.position);

    this.sun.color.copy(new THREE.Color('#ffd3a2').lerp(new THREE.Color('#93aede'), nm));
    this.sun.intensity = 3.1 * (1 - nm) + 0.55 * nm;
    this.sun.position.copy(this.sunDir).multiplyScalar(420).add(new THREE.Vector3(0, 0, 0));
    this.sun.target.position.set(0, 30, 0);
    this.hemi.intensity = 0.85 * (1 - nm) + 0.16 * nm;
    this.hemi.color.setStyle(nm > 0.5 ? '#5f7dab' : '#9fc2e8');
    this.hemi.groundColor.setStyle(nm > 0.5 ? '#1c1a18' : '#4a3f34');
    this.ambient.intensity = 0.22 * (1 - nm) + 0.09 * nm;

    const fogCol = new THREE.Color('#d8a072').lerp(new THREE.Color('#070b12'), nm).lerp(new THREE.Color('#04070d'), space);
    this.scene.fog.color.copy(fogCol);
    this.scene.background.copy(fogCol);
    this.scene.fog.density = 0.00052 * (1 - space * 0.98) * (1 + 0.12 * nm);

    for (const s of this.spots) {
      s.intensity = 15000 * nm * (1 - space);
      s.target.position.set(0, 32, 0);
    }
    for (const b of this.beams) b.material.uniforms.uOpacity.value = nm * (1 - space);
    for (const sp of this.glows) sp.material.opacity = 0.10 + nm * 0.68 * (1 - space * 0.8);

    const er = this.earthRig;
    er.group.visible = this.reveal > 0.003;
    er.mat.uniforms.uReveal.value = this.reveal;
    er.mat.uniforms.uSunDir.value.copy(this.sunDir);
    er.mat.uniforms.uCloudShift.value = (this.time * 0.0016) % 1;
    er.atmosMat.uniforms.uReveal.value = this.reveal;
    er.atmosMat.uniforms.uSunDir.value.copy(this.sunDir);
    er.atmosMatOuter.uniforms.uReveal.value = this.reveal;
    er.atmosMatOuter.uniforms.uSunDir.value.copy(this.sunDir);
    if (this.orbit) er.group.rotation.y += dt * 0.0035;

    const hideGround = this.reveal > 0.62;
    this.terrain.visible = !hideGround;
    for (const m of this.mountains) m.visible = !hideGround;
    if (hideGround) this.scene.fog.density = 0.000004;
  }
}
