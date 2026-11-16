import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, lerp } from './util.js';

export const PAD_HOTSPOTS = [
  { id: 'tower', label: '勤务塔', sub: '96 m 格构塔 / 摆杆', pos: [-26, 78, -1], anchor: 'scene' },
  { id: 'arms', label: '摆杆', sub: '推进剂与供气管路', pos: [-16.2, 50, 3.5], anchor: 'scene' },
  { id: 'mount', label: '发射台', sub: '导流槽 / 支架', pos: [0, 8, 0], anchor: 'scene' },
  { id: 'loxtank', label: '液氧球罐', sub: 'LOX 储罐', pos: [152, 15, -166], anchor: 'scene' },
  { id: 'kero', label: '煤油球罐', sub: 'RP-1 储罐', pos: [-62, 13.5, 34], anchor: 'scene' },
  { id: 'water', label: '水塔', sub: '喷水降温', pos: [142, 36, -156], anchor: 'scene' },
  { id: 'building', label: '总装厂房', sub: '72 × 92 × 52 m', pos: [6, 46, -240], anchor: 'scene' },
];

function markDecals(scene) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(226,228,220,0.20)';
  g.lineWidth = 3;
  for (let r = 120; r <= 420; r += 100) {
    g.beginPath(); g.arc(512, 512, r, 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([26, 20]);
  g.strokeStyle = 'rgba(232,234,226,0.16)';
  g.beginPath(); g.arc(512, 512, 460, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(226,228,220,0.13)';
  g.fillRect(120, 470, 260, 84);
  g.fillRect(644, 470, 260, 84);
  g.fillStyle = 'rgba(255,155,74,0.30)';
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    g.save(); g.translate(512 + Math.cos(a) * 440, 512 + Math.sin(a) * 440); g.rotate(a);
    g.fillRect(-7, -34, 14, 68); g.restore();
  }
  g.font = 'bold 74px monospace';
  g.fillStyle = 'rgba(232,234,226,0.14)';
  g.fillText('LC-09', 420, 300);
  g.font = 'bold 34px monospace';
  g.fillStyle = 'rgba(255,155,74,0.22)';
  g.fillText('STARPORT LAUNCH COMPLEX', 286, 356);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.06;
  plane.renderOrder = 1;
  scene.add(plane);
  return plane;
}

function scorch(scene) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, 'rgba(18,12,8,0.92)');
  grad.addColorStop(0.4, 'rgba(24,18,12,0.55)');
  grad.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 180;
    const rad = 18 + Math.random() * 70;
    const x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r;
    const gg = g.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, 'rgba(0,0,0,0.35)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.08, 0);
  scene.add(plane);
  return plane;
}

export class Pad {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.arms = [];
    this.armOpen = 0;
    this.armTarget = 0;
    this.loaded = false;
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('./assets/launch_complex.glb', (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    });
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          m.envMapIntensity = 1.25;
          if (m.metalness > 0.6) m.metalness = 0.72;
          if (m.roughness > 0.85) m.roughness = 0.8;
          m.needsUpdate = true;
        }
      }
    });
    this.root = root;
    this.scene.add(root);
    for (const name of ['arm_bottom', 'arm_mid', 'arm_top']) {
      const o = root.getObjectByName(name);
      if (o) { o.userData.baseRotY = o.rotation.y; this.arms.push(o); }
    }
    this.decals = markDecals(this.scene);
    this.scorch = scorch(this.scene);
    this.loaded = true;
    return root;
  }

  setArms(open) { this.armTarget = clamp(open, 0, 1); }

  update(dt) {
    this.armOpen = lerp(this.armOpen, this.armTarget, 1 - Math.exp(-dt * 1.6));
    const e = this.armOpen * this.armOpen * (3 - 2 * this.armOpen);
    for (const a of this.arms) a.rotation.y = (a.userData.baseRotY || 0) - e * 1.42;
  }

  setVisible(v) {
    if (this.root) this.root.visible = v;
    if (this.decals) this.decals.visible = v;
    if (this.scorch) this.scorch.visible = v;
  }
}
