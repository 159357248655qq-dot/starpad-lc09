import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { World } from './world.js';
import { Rocket } from './rocket.js';
import { Pad } from './pad.js';
import { Timeline } from './timeline.js';
import { LaunchAudio } from './audio.js';
import { UI } from './ui.js';
import { clamp, lerp, smoothstep } from './util.js';

const ROCKET_BASE = 13.0;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uCon: { value: 1.065 },
    uSat: { value: 1.05 },
    uVig: { value: 0.34 },
    uGrain: { value: 0.014 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uCon, uSat, uVig, uGrain;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.42) * uCon + 0.42;
      float sh = 1.0 - smoothstep(0.0, 0.55, l);
      float hi = smoothstep(0.42, 1.0, l);
      c += vec3(-0.006, 0.0, 0.012) * sh + vec3(0.014, 0.005, -0.008) * hi;
      vec2 q = vUv - 0.5;
      q.x *= 1.18;
      float vig = 1.0 - smoothstep(0.30, 0.86, length(q));
      c *= mix(1.0, vig, uVig);
      float n = fract(sin(dot(vUv * vec2(1297.3, 863.1) + uTime * 0.37, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

class App {
  constructor() {
    this.mode = 'auto';
    this.started = false;
    this.night = false;
    this.audioOn = false;
    this.audioExplicit = false;
    this.hotspotsOn = true;
    this.sonic = false;
    this.shake = 0;
    this.time = 0;
    this._gradeReady = false;
    this.lastCount = -1;
    this.speed = 1;
    this.autoShot = '';
    this.ready = false;
    this._camTarget = new THREE.Vector3(0, 40, 0);
    this._wantPos = new THREE.Vector3();
    this._wantTarget = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.state = { t: -10, phase: 'PRELAUNCH', throttle: 0, altKm: 0, altM: 0, velKmh: 0, mach: 0, renderAlt: 0, tilt: 0, vacuum: 0, railIndex: 0, events: [] };
    this.ui = new UI({
      onLaunch: () => this.launch(),
      onReset: () => this.reset(),
      onAct: (a) => this.act(a),
      onCam: (c) => this.setMode(c),
      onHotspot: () => {},
    });
  }

  async boot() {
    await frame();
    this._initRenderer();
    this.ui.setLoader(24, '构建大气与星空');
    await frame();
    this.world = new World(this.scene, this.renderer);
    this.ui.setLoader(54, '装配运载火箭');
    await frame();
    this.rocket = new Rocket(this.scene);
    this.rocket.group.position.set(0, ROCKET_BASE, 0);
    this.spaceFill = new THREE.DirectionalLight(0xc4d8ff, 0);
    this.spaceFill.castShadow = false;
    this.scene.add(this.spaceFill, this.spaceFill.target);
    this.pad = new Pad(this.scene);
    this.timeline = new Timeline();
    this.audio = new LaunchAudio();
    this.ui.setLoader(62, '装配发射工位与勤务塔');
    try {
      await this.pad.load((p) => this.ui.setLoader(62 + p * 30, '装配发射工位与勤务塔'));
    } catch (e) {
      console.error('pad load failed', e);
      this.ui.toast('发射场模型加载失败，使用基础场景');
    }
    this.ui.setLoader(96, '校准光学与曝光');
    await frame();
    this.camera.position.set(142, 58, 152);
    this.camera.lookAt(this._camTarget);
    this.controls.target.copy(this._camTarget);
    this.ui.setLoader(100, '系统就绪');
    await new Promise((r) => setTimeout(r, 350));
    this.ui.hideLoader();
    this.ui.log(-10, '发射场系统就绪', 'LAUNCH COMPLEX ONLINE');
    this.ui.toast('拖动旋转视角 · 点击「点火发射」开始任务', 2600);
    this.ready = true;
    this.clock = new THREE.Clock();
    this._bindKeys();
    this._installDebug();
    this.animate();
  }

  _initRenderer() {
    const stage = document.getElementById('stage');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 32000);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 1600;
    this.controls.maxPolarAngle = Math.PI * 0.497;
    this.controls.target.set(0, 40, 0);
    this.controls.addEventListener('start', () => {
      if (this.mode !== 'free') { this.mode = 'free'; this.ui.setCam('free'); }
    });

    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * renderer.getPixelRatio(), h * renderer.getPixelRatio(), {
      // ANGLE/D3D11 can resolve a multisampled HalfFloat target as a black band.
      // Keep samples:0; pixelRatio + bloom still give a clean image.
      type: THREE.HalfFloatType, samples: 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.40, 0.58, 0.80);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) this.update(dt, false);
    this.composer.render();
  }

  update(dt, fast) {
    this.time += dt;
    if (this.grade) this.grade.uniforms.uTime.value = this.time;
    let st;
    if (this.timeline.running) {
      st = this.timeline.update(dt * this.speed);
    } else {
      this.timeline.pending = [];
      st = this.timeline.state();
    }
    this.state = st;
    this.handleEvents(st.events);

    if (st.t < 0) {
      const c = Math.max(0, Math.ceil(-st.t));
      if (c <= 8 && c !== this.lastCount) {
        this.lastCount = c;
        if (!fast) this.audio.beep(c <= 3 ? 1320 : 880, c <= 3 ? 0.12 : 0.07, c <= 3 ? 0.2 : 0.11);
      }
    } else if (this.lastCount !== 0) {
      this.lastCount = 0;
    }

    if (st.t > 10.4 && !this.sonic && st.t < 20) {
      this.sonic = true;
      if (!fast) this.audio.sonicBoom();
      this.shake = Math.max(this.shake, 1.15);
    }

    const alt = st.renderAlt;
    this.rocket.group.position.set(0, ROCKET_BASE + alt, 0);
    let tilt = st.tilt || 0;
    if (st.t > 54) tilt *= 1 - smoothstep(54, 64, st.t);
    this.rocket.group.rotation.z = tilt;
    this.rocket.setThrottle(st.throttle || 0);
    this.rocket.update(dt, { alt, vacuum: st.vacuum, tilt });
    const fillK = smoothstep(20, 140, st.altKm || 0);
    this.spaceFill.intensity = fillK * 1.35;
    this.spaceFill.position.copy(this.camera.position).add(new THREE.Vector3(40, 55, 35));
    this.spaceFill.target.position.copy(this.rocket.group.position).add(new THREE.Vector3(0, 45, 0));

    this.pad.setArms(st.t >= -6 ? 1 : 0);
    this.pad.update(dt);

    if (this.vaporT > 0) {
      this.vaporT -= dt;
      this._vent(dt);
    }

    const space = smoothstep(650, 2400, alt);
    const reveal = smoothstep(700, 1750, alt);
    this.world.update(dt, { camera: this.camera, space, reveal, orbit: st.t >= 64 });
    if (this.pad.loaded) this.pad.setVisible(reveal < 0.55);

    this.shake *= Math.exp(-dt * 2.3);

    if (!fast) {
      this.updateCamera(dt, st);
      this.audio.update(dt, { throttle: st.throttle, alt: st.altM, vacuum: st.vacuum, launched: st.launched });
      this.ui.update(st);
      if (this.rocket) this.ui.updateHotspots(st, this.camera, this.rocket.group);
    }
  }

  _vent(dt) {
    if (!this.rocket) return;
    this.vaporAcc = (this.vaporAcc || 0) + dt * 26;
    while (this.vaporAcc > 1) {
      this.vaporAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 7;
      this.rocket.groundSmoke.spawn(
        Math.cos(a) * r, 9 + Math.random() * 16, Math.sin(a) * r,
        Math.cos(a) * (2 + Math.random() * 5), 2 + Math.random() * 3, Math.sin(a) * (2 + Math.random() * 5),
        2.4 + Math.random() * 2.2, 3, 14 + Math.random() * 10, 0.34,
        0.86, 0.88, 0.9
      );
    }
  }

  handleEvents(events) {
    if (!events || !events.length) return;
    for (const ev of events) {
      switch (ev.name) {
        case 'prelaunch':
          this.ui.log(ev.t, '发射程序启动', 'LAUNCH SEQUENCE START');
          break;
        case 'countdown':
          this.ui.log(ev.t, '倒计时开始', 'COUNTDOWN');
          break;
        case 'arms':
          this.pad.setArms(1);
          this.audio.clank();
          this.ui.log(ev.t, '勤务塔摆杆回收', 'SERVICE ARMS RETRACT');
          break;
        case 'purge':
          this.audio.purge();
          this.vaporT = 2.6;
          this.ui.log(ev.t, '贮箱排气吹除', 'TANK PURGE');
          break;
        case 'ignition':
          this.rocket.ignite();
          this.audio.boom();
          this.audio.speak('点火');
          this.shake = 1.1;
          this.vaporT = 1.2;
          this.ui.log(ev.t, '发动机点火', 'IGNITION', true);
          this.ui.toast('点火 · IGNITION', 2000);
          break;
        case 'liftoff':
          this.audio.speak('升空');
          this.audio.boom();
          this.shake = Math.max(this.shake, 1.3);
          this.ui.log(ev.t, '火箭升空', 'LIFTOFF', true);
          break;
        case 'towerClear':
          this.ui.log(ev.t, '飞离塔架', 'TOWER CLEAR');
          break;
        case 'pitch':
          this.ui.log(ev.t, '程序转弯', 'PITCH PROGRAM');
          break;
        case 'maxq':
          this.ui.log(ev.t, '最大动压', 'MAX Q');
          break;
        case 'boosterSep':
          this.rocket.separateBoosters();
          this.audio.clank();
          this.audio.boom();
          this.audio.speak('助推器分离');
          this.shake = Math.max(this.shake, 0.9);
          this.ui.log(ev.t, '助推器分离', 'BOOSTER SEPARATION', true);
          break;
        case 'stageSep':
          this.rocket.separateStage();
          this.audio.clank();
          this.audio.boom();
          this.audio.speak('一级分离');
          this.shake = Math.max(this.shake, 0.8);
          this.ui.log(ev.t, '一级分离，二级点火', 'STAGE SEPARATION', true);
          break;
        case 'fairing':
          this.rocket.releaseFairing();
          this.audio.purge();
          this.audio.speak('整流罩分离');
          this.ui.log(ev.t, '整流罩分离', 'FAIRING SEPARATION', true);
          break;
        case 'stage2Cut':
          this.audio.speak('二级关机');
          this.ui.log(ev.t, '二级发动机关机', 'SECO', true);
          break;
        case 'orbit':
          this.audio.speak('入轨完成');
          this.ui.log(ev.t, '入轨完成', 'ORBIT INSERTION', true);
          this.ui.toast('入轨完成 · 当前高度 ' + Math.round(this.state.altKm) + ' km', 3200);
          break;
        case 'orbitPhase':
          this.rocket.releasePayload();
          this.audio.speak('载荷释放，开始环绕地球');
          this.ui.log(ev.t, '载荷释放 · 环绕地球', 'PAYLOAD DEPLOY / EARTH ORBIT', true);
          break;
      }
    }
  }

  updateCamera(dt, st, snap = false) {
    if (this.mode === 'free') {
      this.controls.update();
      return;
    }
    let pos = this._wantPos;
    let tgt = this._wantTarget;
    let fov = 44;
    const rp = this.rocket.group.position;
    let shot = this.mode;
    if (this.mode === 'auto') {
      const t = st.t;
      if (t < -1.6) {
        const a = 0.62 + Math.sin((t + 10) * 0.045) * 0.12;
        const r = 190;
        pos.set(Math.cos(a) * r, 62, Math.sin(a) * r);
        tgt.set(0, 48, 0);
        fov = 46;
        shot = 'pad';
      } else if (t < 1.4) {
        pos.set(116, 20, 102);
        tgt.set(0, 40, 0);
        fov = 48;
        shot = 'ignition';
      } else if (t < 22) {
        const d = 190 + t * 6.0;
        pos.set(rp.x - d * 0.52, rp.y + 2.0, rp.z + d * 0.85);
        tgt.set(rp.x, rp.y + 24, rp.z);
        fov = 45;
        shot = 'chase';
      } else if (t < 56) {
        const d = 520 + (t - 22) * 4.0;
        pos.set(rp.x - d * 0.62, rp.y + d * 0.22, rp.z + d * 0.76);
        tgt.set(rp.x, rp.y - d * 0.12, rp.z);
        fov = 44;
        shot = 'space';
      } else {
        const a = 0.8 + (t - 56) * 0.035;
        const r = 165;
        pos.set(rp.x + Math.cos(a) * r, rp.y + 58, rp.z + Math.sin(a) * r);
        tgt.set(rp.x, rp.y - 28, rp.z);
        fov = 68;
        shot = 'orbit';
      }
      if (shot !== this.autoShot) { this.autoShot = shot; snap = true; }
    } else if (this.mode === 'wide') {
      pos.set(154, 66, 158); tgt.set(0, 46, 0); fov = 46;
    } else if (this.mode === 'tower') {
      pos.set(116, 20, 102); tgt.set(0, 40, 0); fov = 48;
    } else if (this.mode === 'chase') {
      const d = 210;
      pos.set(rp.x - d * 0.52, rp.y + 2.0, rp.z + d * 0.85);
      tgt.set(rp.x, rp.y + 24, rp.z);
      fov = 45;
    } else if (this.mode === 'orbit') {
      const a = this.time * 0.06;
      const r = 165;
      pos.set(rp.x + Math.cos(a) * r, rp.y + 58, rp.z + Math.sin(a) * r);
      tgt.set(rp.x, rp.y - 28, rp.z);
      fov = 68;
    }

    const k = snap ? 1 : 1 - Math.exp(-dt * (this.mode === 'auto' ? 2.8 : 2.0));
    this.camera.position.lerp(pos, k);
    this._camTarget.lerp(tgt, k);
    const targetFov = fov;
    this.camera.fov = snap ? targetFov : lerp(this.camera.fov, targetFov, k);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(this._camTarget);
    this.camera.lookAt(this._camTarget);

    if (this.shake > 0.002) {
      const s = this.shake * 0.55;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.camera.lookAt(this._camTarget);
    }
  }

  async enableAudio() {
    try {
      await this.audio.enable();
      this.audioOn = true;
      this.ui.setAudio(true);
      if (!this.audio.built) return;
      this.audio.speak('星港发射场，各系统就绪');
    } catch (e) {}
  }

  toggleAudio() {
    if (this.audioOn) {
      this.audio.disable();
      this.audioOn = false;
      this.audioExplicit = true;
      this.ui.setAudio(false);
    } else {
      this.enableAudio();
    }
  }

  launch() {
    if (this.started || !this.ready) return;
    this.started = true;
    this.timeline.start();
    this.ui.setLaunchState(true);
    this.ui.log(-10, '点火程序已启动', 'IGNITION SEQUENCE START', true);
    if (!this.audioOn && !this.audioExplicit) this.enableAudio();
    this.ui.toast('发射程序启动 · 10 秒倒计时', 2600);
  }

  reset() {
    if (!this.ready) return;
    this.timeline.reset();
    this.started = false;
    this.sonic = false;
    this.shake = 0;
    this.vaporT = 0;
    this.lastCount = -1;
    this.autoShot = '';
    this.mode = 'auto';
    this.ui.setCam('auto');
    this.world.orbit = false;
    if (this.rocket) this.rocket.dispose();
    this.rocket = new Rocket(this.scene);
    this.rocket.group.position.set(0, ROCKET_BASE, 0);
    this.pad.setArms(0);
    this.pad.armOpen = 0;
    this.pad.update(1);
    this.pad.setVisible(true);
    this.camera.position.set(142, 58, 152);
    this._camTarget.set(0, 40, 0);
    this.controls.target.copy(this._camTarget);
    this.camera.lookAt(this._camTarget);
    this.controls.update();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.ui.reset();
    this.state = this.timeline.state();
    this.ui.update(this.state);
  }

  act(a) {
    if (a === 'audio') this.toggleAudio();
    else if (a === 'night') {
      this.night = !this.night;
      this.world.setNight(this.night);
      this.ui.setNight(this.night);
      this.ui.toast(this.night ? '夜间照明已开启' : '切换至白昼', 1800);
    } else if (a === 'hotspots') {
      this.hotspotsOn = !this.hotspotsOn;
      this.ui.setHotspots(this.hotspotsOn);
      this.ui.toast(this.hotspotsOn ? '结构标注已开启' : '结构标注已关闭', 1600);
    }
  }

  setMode(mode) {
    if (!['auto', 'wide', 'tower', 'chase', 'orbit', 'free'].includes(mode)) return;
    this.mode = mode;
    this.ui.setCam(mode);
    if (mode === 'free') this.controls.update();
    const names = { auto: '导演镜头', wide: '全景机位', tower: '塔架机位', chase: '追拍镜头', orbit: '环绕镜头' };
    if (names[mode]) this.ui.toast(names[mode], 1400);
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.launch(); }
      else if (k === 'r') this.reset();
      else if (k === 'c') {
        const order = ['auto', 'wide', 'tower', 'chase', 'orbit'];
        const i = order.indexOf(this.mode);
        this.setMode(order[(i + 1) % order.length]);
      } else if (k === 'n') this.act('night');
      else if (k === 'm') this.act('audio');
      else if (k === 'h') this.act('hotspots');
    });
  }

  look(px, py, pz, tx, ty, tz, fov = 46) {
    this.mode = 'free';
    this.ui.setCam('free');
    this.autoShot = '';
    this.camera.position.set(px, py, pz);
    this._camTarget.set(tx, ty, tz);
    this.controls.target.copy(this._camTarget);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this._camTarget);
    this.controls.update();
  }

  _installDebug() {
    const app = this;
    window.__pad = {
      get ready() { return app.ready; },
      state: () => app.state,
      launch: () => app.launch(),
      reset: () => app.reset(),
      setCam: (m) => app.setMode(m),
      act: (a) => app.act(a),
      look: (px, py, pz, tx, ty, tz, fov) => app.look(px, py, pz, tx, ty, tz, fov),
      freeze: () => {
        if (app.timeline) { app.timeline.running = false; app.speed = 0; }
        const t = document.getElementById('toast');
        if (t) t.classList.remove('is-on');
      },
      night: (v) => { app.night = v; app.world.setNight(v); app.ui.setNight(v); },
      nightNow: (v) => {
        app.night = v; app.world.setNight(v); app.ui.setNight(v);
        app.world.nightMix = v ? 1 : 0;
        const st = app.state || app.timeline.state();
        app.world.update(0.016, { camera: app.camera, space: 0, reveal: 0, orbit: false });
        app.ui.update(st);
      },
      sim(target) {
        if (!app.ready) return { error: 'not ready' };
        if (!app.started) {
          app.started = true;
          app.timeline.start();
          app.ui.setLaunchState(true);
        }
        let guard = 0;
        while (app.timeline.t < target && guard++ < 12000 && app.timeline.running) {
          app.update(1 / 30, true);
        }
        const st = app.state;
        app.updateCamera(1 / 60, st, true);
        app.world.update(1 / 60, {
          camera: app.camera,
          space: smoothstep(650, 2400, st.renderAlt),
          reveal: smoothstep(700, 1750, st.renderAlt),
          orbit: st.t >= 64,
        });
        app.ui.update(st);
        app.ui.updateHotspots(st, app.camera, app.rocket.group);
        app.composer.render();
        return { t: st.t, phase: st.phase, altKm: st.altKm, throttle: st.throttle, camera: app.camera.position.toArray() };
      },
      cam: () => app.camera.position.toArray(),
      stageScreen: () => {
        const wp = new THREE.Vector3();
        app.rocket.stage2Group.getWorldPosition(wp);
        const ndc = wp.clone().project(app.camera);
        return { world: wp.toArray(), ndc: ndc.toArray(), screen: [ (ndc.x * 0.5 + 0.5) * innerWidth, (1 - (ndc.y * 0.5 + 0.5)) * innerHeight ] };
      },
      payloadInfo: () => {
        const p = app.rocket.payload;
        const wp = new THREE.Vector3();
        p.getWorldPosition(wp);
        const ndc = wp.clone().project(app.camera);
        return { parent: p.parent === app.scene ? 'scene' : (p.parent === app.rocket.stack ? 'stack' : 'other'), local: p.position.toArray(), world: wp.toArray(), scale: p.scale.x, ndc: ndc.toArray(), screen: [ (ndc.x * 0.5 + 0.5) * innerWidth, (1 - (ndc.y * 0.5 + 0.5)) * innerHeight ] };
      },
      earthRig: () => app.world.earthRig,
      pause: (v) => { app.paused = !!v; },
      setEarth: (v) => { app.world.earthRig.group.visible = !!v; app.composer.render(); },
      setSky: (v) => { app.world.sky.visible = !!v; app.composer.render(); },
    };
  }
}

const app = new App();
app.boot().catch((e) => {
  console.error('boot error', e);
  const el = document.getElementById('loadText');
  if (el) el.textContent = '启动失败：' + (e && e.message ? e.message : e);
});
