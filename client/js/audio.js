// Синтезированные звуки через Web Audio API — без внешних файлов.

let ctx = null;
let master = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Вызывать на первый жест пользователя (требование мобильных браузеров).
export function unlock() { ensure(); }

function noiseBuffer(dur) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function env(gainNode, t0, peak, dur) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(freq0, freq1, dur, type, peak, when = 0) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + dur);
  env(g, t0, peak, dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur, freq0, freq1, q, peak, when = 0) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq0, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, peak, dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  // свист замаха/удара по воздуху
  whoosh() {
    noise(0.18, 2400, 500, 1.2, 0.5);
  },
  // попадание: глухой удар + треск
  hit() {
    tone(190, 52, 0.22, 'sine', 0.9);
    tone(300, 90, 0.1, 'triangle', 0.5);
    noise(0.14, 1800, 300, 0.8, 0.7);
  },
  // нокаут — тяжелее и длиннее
  ko() {
    tone(150, 34, 0.5, 'sine', 1.0);
    noise(0.3, 1200, 150, 0.7, 0.8);
    tone(80, 30, 0.6, 'square', 0.25, 0.05);
  },
  // шаги обратного отсчёта и старт
  count() { tone(560, 540, 0.12, 'square', 0.22); },
  go() {
    tone(880, 860, 0.3, 'square', 0.3);
    tone(1320, 1300, 0.3, 'square', 0.15);
  },
  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => tone(f, f, 0.28, 'triangle', 0.4, i * 0.13));
    notes.forEach((f, i) => tone(f * 2, f * 2, 0.2, 'sine', 0.12, i * 0.13));
  },
  lose() {
    tone(220, 210, 0.4, 'sawtooth', 0.25);
    tone(160, 110, 0.8, 'sawtooth', 0.3, 0.3);
  },
};
