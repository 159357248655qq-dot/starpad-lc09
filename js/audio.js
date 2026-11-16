import { clamp } from './util.js';

function makeNoise(ctx, kind = 'white', seconds = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function makeImpulse(ctx, seconds = 2.6, decay = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 90 ? i / 90 : 1);
    }
  }
  return buf;
}

export class LaunchAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.built = false;
    this.muted = false;
    this.voiceOn = true;
    this.time = 0;
    this._srcs = [];
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15; comp.knee.value = 22; comp.ratio.value = 3.4;
    comp.attack.value = 0.008; comp.release.value = 0.3;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.15;
    conv.connect(wet).connect(master);
    this.reverb = conv;

    const sources = [];
    const loop = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      sources.push(s);
      return s;
    };
    const brown = makeNoise(ctx, 'brown');
    const white = makeNoise(ctx, 'white');
    const white2 = makeNoise(ctx, 'white');
    const white3 = makeNoise(ctx, 'white');

    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass'; this.rumbleFilter.frequency.value = 120; this.rumbleFilter.Q.value = 0.8;
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    loop(brown).connect(this.rumbleFilter).connect(this.rumbleGain).connect(master);
    this.rumbleGain.connect(conv);

    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'bandpass'; this.roarFilter.frequency.value = 460; this.roarFilter.Q.value = 0.62;
    this.roarShaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.1); }
    this.roarShaper.curve = curve;
    this.roarGain = ctx.createGain(); this.roarGain.gain.value = 0;
    loop(white).connect(this.roarFilter).connect(this.roarShaper).connect(this.roarGain).connect(master);
    this.roarGain.connect(conv);

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine'; this.subOsc.frequency.value = 34;
    sources.push(this.subOsc);
    this.subGain = ctx.createGain(); this.subGain.gain.value = 0;
    this.subOsc.connect(this.subGain).connect(master);
    this.subGain.connect(conv);

    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'highpass'; this.hissFilter.frequency.value = 3400;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    loop(white2).connect(this.hissFilter).connect(this.hissGain).connect(master);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 520; this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    loop(white3).connect(this.windFilter).connect(this.windGain).connect(master);
    this.windGain.connect(conv);

    for (const s of sources) { try { s.start(0); } catch (e) {} }
    this._srcs = sources;
    this.built = true;
  }

  async enable() {
    if (!this.ctx) this._build();
    try { await this.ctx.resume(); } catch (e) {}
    this.enabled = true;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.22);
    return true;
  }

  disable() {
    this.enabled = false;
    if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m || !this.enabled ? 0 : 0.9, this.ctx.currentTime, 0.12);
    }
  }

  _env(node, t0, attack, hold, release, peak) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  beep(freq = 880, dur = 0.09, amp = 0.16) {
    if (!this.built || !this.enabled || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    this._env(g, t, 0.008, dur * 0.4, dur * 0.5, amp);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.08);
  }

  boom() {
    if (!this.built || !this.enabled || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(74, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.4);
    const g = ctx.createGain();
    this._env(g, t, 0.02, 0.3, 1.5, 0.55);
    o.connect(g).connect(this.master); g.connect(this.reverb);
    o.start(t); o.stop(t + 2.0);
    const n = ctx.createBufferSource(); n.buffer = makeNoise(ctx, 'brown', 1.6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const ng = ctx.createGain(); this._env(ng, t, 0.02, 0.2, 1.3, 0.5);
    n.connect(f).connect(ng).connect(this.master); ng.connect(this.reverb);
    n.start(t);
  }

  sonicBoom() {
    if (!this.built || !this.enabled || this.muted) return;
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + i * 0.19;
      const n = ctx.createBufferSource(); n.buffer = makeNoise(ctx, 'brown', 1.2);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(380, t);
      f.frequency.exponentialRampToValueAtTime(90, t + 0.7);
      const g = ctx.createGain(); this._env(g, t, 0.004, 0.05, 0.75, 0.62 - i * 0.15);
      n.connect(f).connect(g).connect(this.master); g.connect(this.reverb);
      n.start(t);
    }
  }

  clank() {
    if (!this.built || !this.enabled || this.muted) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.07 + Math.random() * 0.03;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = 1200 + Math.random() * 1800;
      const g = ctx.createGain(); this._env(g, t, 0.002, 0.01, 0.22, 0.10);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
    }
    const n = ctx.createBufferSource(); n.buffer = makeNoise(ctx, 'white', 0.4);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1600;
    const g = ctx.createGain(); this._env(g, ctx.currentTime, 0.003, 0.02, 0.25, 0.10);
    n.connect(f).connect(g).connect(this.master); n.start(ctx.currentTime);
  }

  purge() {
    if (!this.built || !this.enabled || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = makeNoise(ctx, 'white', 1.8);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
  }

  speak(text) {
    if (!this.voiceOn || !this.enabled || this.muted) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1.0; u.pitch = 0.86; u.volume = 0.7;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  update(dt, st) {
    if (!this.built || !this.ctx) return;
    this.time += dt;
    const t = this.ctx.currentTime;
    const th = clamp(st.throttle || 0, 0, 1.05);
    const alt = st.alt || 0;
    const air = clamp(1 - alt / 52000, 0.03, 1);
    const space = st.vacuum || 0;
    const windBase = this.enabled ? 0.10 + 0.03 * Math.sin(this.time * 0.21) : 0;
    const set = (param, v, tc = 0.16) => { try { param.setTargetAtTime(v, t, tc); } catch (e) {} };

    set(this.rumbleGain.gain, th * air * (0.55 + 0.12 * Math.sin(this.time * 7.3)), 0.12);
    set(this.roarGain.gain, th * air * (0.42 + 0.08 * Math.sin(this.time * 3.1)), 0.12);
    set(this.subGain.gain, th * (0.24 + 0.06 * Math.sin(this.time * 1.7)), 0.2);
    set(this.hissGain.gain, th * air * air * 0.10, 0.2);
    set(this.windGain.gain, windBase * (1 - th * 0.75) * (1 - space * 0.9), 0.5);
    try {
      this.rumbleFilter.frequency.setTargetAtTime(90 + th * 70 + (1 - air) * 40, t, 0.3);
      this.roarFilter.frequency.setTargetAtTime(380 + th * 320, t, 0.3);
      this.windFilter.frequency.setTargetAtTime(480 + (1 - air) * 240, t, 0.4);
      this.subOsc.frequency.setTargetAtTime(30 + th * 8, t, 0.5);
    } catch (e) {}
  }
}
