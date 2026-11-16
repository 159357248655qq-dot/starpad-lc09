import * as THREE from 'three';
import { EARTH_VERT, EARTH_FRAG, ATMOS_VERT, ATMOS_FRAG } from './shaders.js';

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
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function generateTextures() {
  const W = 1024, H = 512;
  const dayC = document.createElement('canvas'); dayC.width = W; dayC.height = H;
  const nightC = document.createElement('canvas'); nightC.width = W; nightC.height = H;
  const dayI = dayC.getContext('2d').createImageData(W, H);
  const nightI = nightC.getContext('2d').createImageData(W, H);
  const d = dayI.data, n = nightI.data;

  const blobs = [
    [0.4, 0.28, 0.6, 1.15], [-0.85, 0.10, 0.55, 1.0], [0.15, -0.35, 0.62, 1.15],
    [0.9, 0.4, 0.4, 0.85], [-0.55, -0.5, 0.5, 0.9], [-0.1, 0.65, 0.45, 0.75],
    [0.0, 1.0, 0.0, -1.50], [0.85, 0.35, 0.35, 0.55], [-0.75, 0.30, -0.55, 0.50],
  ];
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const lat = (0.5 - v) * Math.PI;
    const cy = Math.sin(lat), cl = Math.cos(lat);
    const temp = Math.cos(lat);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const lon = (u - 0.5) * TAU;
      const cx = cl * Math.cos(lon), cz = cl * Math.sin(lon);
      let h = fbm3(cx * 1.9 + 3.1, cy * 1.9 + 7.7, cz * 1.9 + 1.3, 4);
      h = h * 1.18 - 0.08;
      for (const b of blobs) {
        const dt = cx * b[0] + cy * b[1] + cz * b[2];
        if (dt > 0) h += Math.pow(dt, 1.5) * b[3] * 0.22;
      }
      const land = smoothstep(0.50, 0.545, h);
      const idx = (y * W + x) * 4;

      let r, g, b;
      if (land < 0.5) {
        const depth = Math.min(1, Math.max(0, (0.50 - h) * 5.5));
        r = 14 + (4 - 14) * depth; g = 50 + (10 - 50) * depth; b = 96 + (28 - 96) * depth;
        const shelf = smoothstep(0.44, 0.50, h) * (1 - depth);
        r += shelf * 8; g += shelf * 18; b += shelf * 20;
      } else {
        const moist = fbm3(cx * 5.2 + 11.0, cy * 5.2, cz * 5.2, 3);
        const rugged = fbm3(cx * 14.0, cy * 14.0, cz * 14.0, 2);
        const absLat = Math.abs(lat);
        if (temp > 0.72) {
          const dry = smoothstep(0.42, 0.62, moist);
          r = 26 + (126 - 26) * dry; g = 66 + (106 - 66) * dry; b = 34 + (62 - 34) * dry;
        } else if (temp > 0.40) {
          const dry = smoothstep(0.40, 0.60, moist);
          r = 58 + (142 - 58) * dry; g = 78 + (118 - 78) * dry; b = 46 + (72 - 46) * dry;
        } else {
          const dry = smoothstep(0.45, 0.62, moist);
          r = 56 + (104 - 56) * dry; g = 70 + (94 - 70) * dry; b = 54 + (70 - 54) * dry;
        }
        const sh = 0.82 + 0.18 * rugged;
        const grain = fbm3(cx * 37.0 + 19.0, cy * 37.0, cz * 37.0, 3);
        const tint = 0.82 + 0.36 * grain;
        r *= sh * tint; g *= sh * tint; b *= sh * tint;
        const snow = smoothstep(0.64, 0.82, rugged) * smoothstep(0.85, 1.25, absLat) * 0.8;
        r = r * (1 - snow) + 208 * snow;
        g = g * (1 - snow) + 216 * snow;
        b = b * (1 - snow) + 224 * snow;
      }
      const coast = smoothstep(0.62, 0.50, h) * land;
      d[idx] = Math.min(255, Math.max(0, r + coast * 10));
      d[idx + 1] = Math.min(255, Math.max(0, g + coast * 12));
      d[idx + 2] = Math.min(255, Math.max(0, b + coast * 8));
      d[idx + 3] = Math.round(land * 255);

      n[idx] = 0; n[idx + 1] = 0; n[idx + 2] = 0; n[idx + 3] = 255;
      if (land > 0.7) {
        const city = fbm3(cx * 26.0 + 31.7, cy * 26.0, cz * 26.0, 2);
        const coastal = smoothstep(0.62, 0.53, h);
        let light = smoothstep(0.56, 0.72, city) * (0.35 + coastal * 0.9);
        light *= smoothstep(1.25, 0.95, Math.abs(lat));
        if (light > 0.01) {
          n[idx] = Math.min(255, 255 * light);
          n[idx + 1] = Math.min(255, 196 * light);
          n[idx + 2] = Math.min(255, 120 * light);
        }
      }
    }
  }
  dayC.getContext('2d').putImageData(dayI, 0, 0);
  nightC.getContext('2d').putImageData(nightI, 0, 0);

  const CW = 512, CH = 256;
  const cloudC = document.createElement('canvas'); cloudC.width = CW; cloudC.height = CH;
  const cI = cloudC.getContext('2d').createImageData(CW, CH);
  const cd = cI.data;
  for (let y = 0; y < CH; y++) {
    const v = y / (CH - 1), lat = (0.5 - v) * Math.PI;
    const cy = Math.sin(lat), cl = Math.cos(lat);
    for (let x = 0; x < CW; x++) {
      const u = x / (CW - 1), lon = (u - 0.5) * TAU;
      const cx = cl * Math.cos(lon), cz = cl * Math.sin(lon);
      const swirl = fbm3(cx * 2.2 + 5.0, cy * 2.2, cz * 2.2, 2);
      let c = fbm3(cx * 4.6 + swirl * 2.4, cy * 4.6 + swirl * 1.2, cz * 4.6, 4);
      const bands = 0.5 + 0.5 * Math.sin(lat * 7.0 + swirl * 3.0);
      c = c * 0.72 + bands * 0.22 - 0.08;
      const a = smoothstep(0.33, 0.55, c) * 0.90;
      const i = (y * CW + x) * 4;
      cd[i] = 255; cd[i + 1] = 255; cd[i + 2] = 255; cd[i + 3] = Math.round(a * 255);
    }
  }
  cloudC.getContext('2d').putImageData(cI, 0, 0);

  const mk = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { day: mk(dayC), night: mk(nightC), cloud: mk(cloudC) };
}

export function buildEarth(scene, sunDir) {
  const tex = generateTextures();
  const group = new THREE.Group();
  group.position.set(0, -12000, 0);
  group.visible = false;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: tex.day }, uNightMap: { value: tex.night }, uCloud: { value: tex.cloud },
      uSunDir: { value: sunDir.clone() }, uReveal: { value: 0 }, uCloudShift: { value: 0 },
    },
    vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(12000, 192, 96), mat);
  earth.rotation.y = 2.35;
  group.add(earth);

  const atmosMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() }, uColor: { value: new THREE.Color('#2a6fff') },
      uReveal: { value: 0 }, uStrength: { value: 0.85 },
    },
    vertexShader: ATMOS_VERT, fragmentShader: ATMOS_FRAG,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const atmos = new THREE.Mesh(new THREE.SphereGeometry(12280, 96, 48), atmosMat);
  atmos.renderOrder = 2;
  group.add(atmos);

  const atmosMatOuter = atmosMat.clone();
  atmosMatOuter.uniforms = THREE.UniformsUtils.clone(atmosMat.uniforms);
  atmosMatOuter.uniforms.uStrength.value = 0.30;
  const atmosOuter = new THREE.Mesh(new THREE.SphereGeometry(12650, 80, 40), atmosMatOuter);
  atmosOuter.renderOrder = 1;
  group.add(atmosOuter);

  scene.add(group);
  return { group, earth, mat, atmosMat, atmosMatOuter };
}
