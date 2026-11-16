import * as THREE from 'three';
import { EARTH_VERT, EARTH_FRAG, ATMOS_VERT, ATMOS_FRAG } from './shaders.js';

const EARTH_R = 10000;
const loader = new THREE.TextureLoader();

function loadMap(file, srgb = true, anisotropy = 4) {
  const tex = loader.load(new URL(`../assets/earth/${file}`, import.meta.url).href);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = anisotropy;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function buildEarth(scene, sunDir, renderer) {
  const aniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const day = loadMap('earth_day_4k.jpg', true, aniso);
  const cloud = loadMap('earth_clouds_4k_v2.png', true, aniso);
  const night = loadMap('earth_night_4k.jpg', true, aniso);
  const spec = loadMap('earth_spec.jpg', false, aniso);

  const group = new THREE.Group();
  group.position.set(0, -EARTH_R, 0);
  group.visible = false;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: day },
      uCloud: { value: cloud },
      uNightMap: { value: night },
      uSpec: { value: spec },
      uSunDir: { value: sunDir.clone() },
      uReveal: { value: 0 },
      uCloudShift: { value: 0 },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 192, 96), mat);
  // Tilt the globe so the visible limb shows mid-latitude continents rather than the polar cap.
  earth.rotation.set(0.953, -0.175, -0.335);
  group.add(earth);

  const atmosMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uColor: { value: new THREE.Color('#2568ff') },
      uReveal: { value: 0 },
      uStrength: { value: 2.40 },
      uPower: { value: 4.2 },
    },
    vertexShader: ATMOS_VERT, fragmentShader: ATMOS_FRAG,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const atmos = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R + 115, 128, 64), atmosMat);
  atmos.renderOrder = 3;
  group.add(atmos);

  const atmosMatOuter = atmosMat.clone();
  atmosMatOuter.uniforms = THREE.UniformsUtils.clone(atmosMat.uniforms);
  atmosMatOuter.uniforms.uStrength.value = 0.95;
  atmosMatOuter.uniforms.uPower.value = 1.9;
  const atmosOuter = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R + 280, 112, 56), atmosMatOuter);
  atmosOuter.renderOrder = 2;
  group.add(atmosOuter);

  scene.add(group);
  return { group, earth, mat, atmosMat, atmosMatOuter };
}
