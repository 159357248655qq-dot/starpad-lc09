const PHASES = {
  STANDBY: ['待命', 'STANDBY'],
  PRELAUNCH: ['待命', 'STANDBY'],
  COUNTDOWN: ['倒计时', 'COUNTDOWN'],
  IGNITION: ['点火', 'IGNITION'],
  LIFTOFF: ['升空', 'LIFTOFF'],
  ASCENT: ['上升', 'ASCENT'],
  STAGE2: ['二级飞行', 'STAGE 2'],
  ORBIT: ['环绕', 'ORBIT'],
};

const HOTSPOTS = [
  { id: 'tower', label: '勤务塔 96m', sub: '格构式勤务塔 · 摆杆与吊臂', pos: [-26, 78, -1], anchor: 'scene' },
  { id: 'arms', label: '摆杆', sub: '推进剂加注与供气摆杆', pos: [-15, 50, 3.4], anchor: 'scene' },
  { id: 'mount', label: '发射台', sub: '导流槽 · 发射支架 · 喷水降温', pos: [0, 7, 0], anchor: 'scene' },
  { id: 'lox', label: '液氧球罐', sub: 'LOX 储罐 · 低温推进剂', pos: [152, 28, -166], anchor: 'scene' },
  { id: 'kero', label: '煤油球罐', sub: 'RP-1 储罐', pos: [-62, 26, 34], anchor: 'scene' },
  { id: 'water', label: '水塔', sub: '喷水降温系统', pos: [142, 52, -156], anchor: 'scene' },
  { id: 'core', label: '芯一级', sub: '两级半构型 · 4 助推器', pos: [0, 22, 0], anchor: 'rocket' },
  { id: 'fairing', label: '整流罩 / 载荷', sub: '卫星载荷与整流罩', pos: [0, 64, 0], anchor: 'rocket' },
];

export function formatClock(t) {
  const s = Math.abs(t);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return 'T' + (t < 0 ? '-' : '+') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    const $ = (id) => document.getElementById(id);
    this.$ = {
      clock: $('clock'), phaseZh: $('phaseZh'), phaseEn: $('phaseEn'), warp: $('warpTag'),
      railFill: $('railFill'), alt: $('alt'), vel: $('vel'), mach: $('mach'), thr: $('thr'),
      altBar: $('altBar'), velBar: $('velBar'), machBar: $('machBar'), thrBar: $('thrBar'),
      log: $('log'), hotspots: $('hotspots'), hotspotNote: $('hotspotNote'),
      toast: $('toast'), loader: $('loader'), loadFill: $('loadFill'), loadText: $('loadText'), loadPct: $('loadPct'),
      orbit: $('orbitReadout'), perigee: $('perigee'), btnLaunch: $('btnLaunch'), btnReset: $('btnReset'),
    };
    this.railLi = Array.from(document.querySelectorAll('.rail li'));
    this.stageEls = {};
    document.querySelectorAll('[data-st]').forEach((el) => { this.stageEls[el.dataset.st] = el; });
    this.hotspotsOn = true;
    this.phaseKey = '';
    this.toastTimer = 0;
    this.hotspotEls = [];
    this._buildHotspots();
    this._bind();
    this.setLoader(8, '载入星港任务数据');
  }

  _buildHotspots() {
    for (const h of HOTSPOTS) {
      const el = document.createElement('div');
      el.className = 'hotspot';
      el.dataset.id = h.id;
      const span = document.createElement('span');
      span.textContent = h.label;
      el.appendChild(span);
      el.addEventListener('click', () => {
        this.toast(h.label + ' · ' + h.sub, 3200);
        if (this.hooks.onHotspot) this.hooks.onHotspot(h);
      });
      this.$.hotspots.appendChild(el);
      this.hotspotEls.push({ def: h, el });
    }
  }

  _bind() {
    this.$.btnLaunch.addEventListener('click', () => this.hooks.onLaunch && this.hooks.onLaunch());
    this.$.btnReset.addEventListener('click', () => this.hooks.onReset && this.hooks.onReset());
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => this.hooks.onAct && this.hooks.onAct(b.dataset.act));
    });
    document.querySelectorAll('[data-cam]').forEach((b) => {
      b.addEventListener('click', () => this.hooks.onCam && this.hooks.onCam(b.dataset.cam));
    });
  }

  setLoader(pct, text) {
    const p = Math.max(0, Math.min(100, pct));
    if (this.$.loadFill) this.$.loadFill.style.width = p.toFixed(0) + '%';
    if (this.$.loadPct) this.$.loadPct.textContent = p.toFixed(0) + '%';
    if (text && this.$.loadText) this.$.loadText.textContent = text;
  }

  hideLoader() { this.$.loader.classList.add('is-off'); }

  setWarp(label) { if (this.$.warp) this.$.warp.textContent = label; }

  setCam(mode) {
    document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('is-on', b.dataset.cam === mode));
  }

  setAudio(on) {
    const b = document.querySelector('[data-act="audio"]');
    if (!b) return;
    b.classList.toggle('is-on', on);
    const em = b.querySelector('em');
    if (em) em.textContent = on ? 'ON' : 'OFF';
  }

  setNight(on) {
    const b = document.querySelector('[data-act="night"]');
    if (!b) return;
    const em = b.querySelector('em');
    if (em) em.textContent = on ? 'NIGHT' : 'DAY';
    b.classList.toggle('is-on', on);
  }

  setHotspots(on) {
    this.hotspotsOn = on;
    const b = document.querySelector('[data-act="hotspots"]');
    if (b) {
      b.classList.toggle('is-on', on);
      const em = b.querySelector('em');
      if (em) em.textContent = on ? 'ON' : 'OFF';
    }
    if (!on) for (const h of this.hotspotEls) h.el.classList.remove('is-visible');
  }

  setLaunchState(started) {
    this.$.btnLaunch.disabled = started;
    this.$.btnReset.disabled = !started;
    const zh = this.$.btnLaunch.querySelector('.launch-zh');
    const en = this.$.btnLaunch.querySelector('.launch-en');
    if (zh) zh.textContent = started ? '任务进行中' : '点火发射';
    if (en) en.textContent = started ? 'MISSION ACTIVE' : 'IGNITION';
    const hint = document.getElementById('hintSpace');
    if (hint) hint.textContent = started ? '任务执行中' : '空格 点火';
  }

  toast(text, ms = 2400) {
    const el = this.$.toast;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
  }

  log(t, zh, en, major = false) {
    const li = document.createElement('li');
    if (major) li.className = 'is-major';
    const time = document.createElement('time');
    time.textContent = formatClock(t);
    const body = document.createElement('div');
    body.textContent = zh;
    const em = document.createElement('em');
    em.textContent = en;
    body.appendChild(em);
    li.appendChild(time);
    li.appendChild(body);
    this.$.log.prepend(li);
    while (this.$.log.children.length > 7) this.$.log.lastChild.remove();
  }

  update(s) {
    const t = s.t;
    this.$.clock.textContent = formatClock(t);
    this.$.warp.textContent = '×1';

    const key = s.phase || 'STANDBY';
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      const p = PHASES[key] || PHASES.STANDBY;
      this.$.phaseZh.textContent = p[0];
      this.$.phaseEn.textContent = p[1];
    }

    const idx = t < -1.6 ? -1 : (s.railIndex ?? 0);
    this.railLi.forEach((li, i) => {
      li.classList.toggle('is-active', i === idx);
      li.classList.toggle('is-done', i < idx);
    });
    this.$.railFill.style.width = idx <= 0 ? '0%' : (idx / 3 * 100).toFixed(1) + '%';

    const alt = s.altKm || 0;
    const altText = alt < 10 ? alt.toFixed(2) : alt < 100 ? alt.toFixed(1) : Math.round(alt).toString();
    this.$.alt.textContent = altText;
    this.$.vel.textContent = Math.round(s.velKmh || 0).toString();
    this.$.mach.textContent = (s.mach || 0).toFixed(1);
    this.$.thr.textContent = Math.round((s.throttle || 0) * 100).toString();
    this.$.altBar.style.right = (100 - Math.min(100, alt / 210 * 100)) + '%';
    this.$.velBar.style.right = (100 - Math.min(100, (s.velKmh || 0) / 8000 * 100)) + '%';
    this.$.machBar.style.right = (100 - Math.min(100, (s.mach || 0) / 8 * 100)) + '%';
    this.$.thrBar.style.right = (100 - Math.min(100, (s.throttle || 0) * 100)) + '%';

    const live = {
      boosters: t >= 0 && t < 22 ? 'live' : t >= 22 ? 'gone' : '',
      stage1: t >= 0 && t < 34 ? 'live' : t >= 34 ? 'gone' : '',
      stage2: t >= 34 && t < 56 ? 'live' : t >= 56 ? 'gone' : '',
      payload: t >= 38 && t < 120 ? 'live' : t >= 57 ? 'live' : '',
    };
    for (const k in this.stageEls) {
      const el = this.stageEls[k];
      el.classList.toggle('is-live', live[k] === 'live');
      el.classList.toggle('is-gone', live[k] === 'gone');
    }

    const orbitOn = t >= 52;
    this.$.orbit.classList.toggle('is-on', orbitOn);
    if (orbitOn) this.$.perigee.textContent = t >= 56 ? '208 km' : '—';
  }

  updateHotspots(s, camera, rocketGroup) {
    const w = window.innerWidth, h = window.innerHeight;
    const padOn = s.renderAlt < 820 && s.t < 60;
    const rocketOn = s.t < 38;
    for (const item of this.hotspotEls) {
      const def = item.def;
      const isRocket = def.anchor === 'rocket';
      let visible = this.hotspotsOn && (isRocket ? rocketOn : padOn);
      if (visible) {
        const v = { x: def.pos[0], y: def.pos[1], z: def.pos[2] };
        const p = new (camera.position.constructor)(v.x, v.y, v.z);
        if (isRocket && rocketGroup) {
          rocketGroup.updateMatrixWorld(true);
          p.applyMatrix4(rocketGroup.matrixWorld);
        }
        p.project(camera);
        const sx = (p.x * 0.5 + 0.5) * w;
        const sy = (-p.y * 0.5 + 0.5) * h;
        if (p.z > 1 || p.z < -1 || sx < 24 || sx > w - 24 || sy < 74 || sy > h - 90) visible = false;
        else {
          item.el.style.left = sx.toFixed(1) + 'px';
          item.el.style.top = sy.toFixed(1) + 'px';
        }
      }
      item.el.classList.toggle('is-visible', visible);
    }
  }

  reset() {
    this.$.log.innerHTML = '';
    this.$.orbit.classList.remove('is-on');
    this.$.perigee.textContent = '—';
    this.$.clock.textContent = 'T-00:10';
    this.$.phaseZh.textContent = '待命';
    this.$.phaseEn.textContent = 'STANDBY';
    this.phaseKey = 'STANDBY';
    this.railLi.forEach((li) => { li.classList.remove('is-active', 'is-done'); });
    this.$.railFill.style.width = '0%';
    this.$.alt.textContent = '0'; this.$.vel.textContent = '0';
    this.$.mach.textContent = '0.0'; this.$.thr.textContent = '0';
    for (const b of [this.$.altBar, this.$.velBar, this.$.machBar, this.$.thrBar]) b.style.right = '100%';
    for (const k in this.stageEls) this.stageEls[k].classList.remove('is-live', 'is-gone');
    this.setLaunchState(false);
    this.toast('发射场已复位', 1800);
  }
}
