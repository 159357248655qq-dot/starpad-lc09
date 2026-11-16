import { clamp, lerp, smoothstep, easeInOut } from './util.js';

export const RAIL = ['点火', '升空', '入轨', '环绕'];

const EVENTS = [
  { t: -10.0, name: 'prelaunch', label: '发射程序启动', phase: 'PRELAUNCH' },
  { t: -8.0, name: 'countdown', label: '倒计时开始', phase: 'COUNTDOWN' },
  { t: -6.0, name: 'arms', label: '摆杆回收', phase: 'COUNTDOWN' },
  { t: -3.2, name: 'purge', label: '排气/吹除', phase: 'COUNTDOWN' },
  { t: -1.6, name: 'ignition', label: '发动机点火', phase: 'IGNITION' },
  { t: 0.0, name: 'liftoff', label: '火箭升空', phase: 'LIFTOFF' },
  { t: 3.0, name: 'towerClear', label: '飞离塔架', phase: 'ASCENT' },
  { t: 8.0, name: 'pitch', label: '程序转弯', phase: 'ASCENT' },
  { t: 16.0, name: 'maxq', label: '最大动压', phase: 'ASCENT' },
  { t: 22.0, name: 'boosterSep', label: '助推器分离', phase: 'ASCENT' },
  { t: 34.0, name: 'stageSep', label: '一级分离', phase: 'STAGE2' },
  { t: 38.5, name: 'fairing', label: '整流罩分离', phase: 'STAGE2' },
  { t: 52.0, name: 'stage2Cut', label: '二级关机', phase: 'STAGE2' },
  { t: 56.0, name: 'orbit', label: '入轨完成', phase: 'ORBIT' },
  { t: 64.0, name: 'orbitPhase', label: '环绕地球', phase: 'ORBIT' },
];

const TELEMETRY = [
  [0, 0, 0], [3, 0.18, 110], [8, 0.85, 320], [16, 3.4, 640], [22, 6.2, 860],
  [34, 14.5, 1900], [38.5, 20.0, 2400], [52, 62.0, 5200], [56, 198.0, 7800], [64, 208.0, 7800], [120, 208.0, 7800]
];

function sampleTelemetry(t) {
  if (t <= 0) return { alt: 0, vel: 0 };
  for (let i = 1; i < TELEMETRY.length; i++) {
    const [t1, a1, v1] = TELEMETRY[i];
    const [t0, a0, v0] = TELEMETRY[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return { alt: lerp(a0, a1, k), vel: lerp(v0, v1, k) };
    }
  }
  const last = TELEMETRY[TELEMETRY.length - 1];
  return { alt: last[1], vel: last[2] };
}

export class Timeline {
  constructor() {
    this.t = -10.0;
    this.running = false;
    this.finished = false;
    this.eventIndex = 0;
    this.pending = [];
    this.countdownTicks = new Set();
    this.phase = 'PRELAUNCH';
    this.maxT = 148;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t = -10.0;
    this.eventIndex = 0;
    this.pending = [];
  }

  reset() {
    this.t = -10.0;
    this.running = false;
    this.finished = false;
    this.eventIndex = 0;
    this.pending = [];
    this.phase = 'PRELAUNCH';
    this.countdownTicks.clear();
  }

  update(dt, speed = 1) {
    if (!this.running || this.finished) return this.state(0);
    const prev = this.t;
    this.t += dt * speed;
    this.pending = [];
    while (this.eventIndex < EVENTS.length && this.t >= EVENTS[this.eventIndex].t) {
      const ev = EVENTS[this.eventIndex];
      if (ev.t > prev || this.eventIndex === 0) {
        this.pending.push(ev);
        this.phase = ev.phase;
      }
      this.eventIndex++;
    }
    if (this.phase === 'STAGE2' && this.t >= 56) this.phase = 'ORBIT';
    if (this.t >= this.maxT) { this.t = this.maxT; this.finished = true; this.running = false; }
    return this.state(dt);
  }

  state() {
    const t = this.t;
    const launched = t >= 0;
    const ign = t >= -1.6;
    let throttle = 0;
    if (ign) throttle = smoothstep(-1.6, 0.9, t);
    if (t >= 22) throttle = 0.96;
    if (t >= 34) throttle = 0.82;
    if (t >= 46) throttle = 0.62;
    if (t >= 52) throttle = 0;
    if (t > 128) throttle = 0;
    const tele = sampleTelemetry(t);
    const altM = tele.alt * 1000;
    const velKmh = tele.vel;
    const mach = velKmh / 1062;
    const renderAlt = t <= 0 ? 0 : 3550 * (1 - Math.exp(-Math.max(0, t - 1.2) / 10.5));
    const tilt = smoothstep(7, 62, t) * 0.92;
    const vacuum = smoothstep(9, 55, t) * 0.85;
    const railIndex = t < 0 ? 0 : t < 8 ? 1 : t < 54 ? 2 : 3;
    return {
      t, phase: this.phase, launched, ign, throttle, altM, altKm: altM / 1000,
      velKmh, mach, renderAlt, tilt, vacuum, railIndex,
      countdown: t < 0 ? Math.max(0, Math.ceil(-t)) : 0,
      events: this.pending.slice(),
    };
  }
}
