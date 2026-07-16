import { store } from "./store.js";

// 純合成音效（Web Audio，零音檔）＋觸覺回饋。預設關（教室情境），同一顆鈕控制。
let ctx = null;

export function isSfxOn() {
  return store.read("sfxOn", false);
}

export function setSfxOn(on) {
  store.write("sfxOn", !!on);
  if (on) ensureCtx();
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, { dur = 0.12, type = "triangle", gain = 0.16, delay = 0 } = {}) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst({ dur = 0.09, gain = 0.22, delay = 0 } = {}) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}

function buzz(pattern) {
  navigator.vibrate?.(pattern);
}

export const sfx = {
  // 答對：上行雙音，連對越長音高越高（音高階梯）
  correct(streak = 0) {
    if (!isSfxOn()) return;
    const step = Math.min(streak, 8);
    const base = 523.25 * Math.pow(2, step / 12); // C5 起跳
    tone(base, { dur: 0.09 });
    tone(base * 1.26, { dur: 0.14, delay: 0.07 }); // 大三度上行
    buzz(30);
  },
  wrong() {
    if (!isSfxOn()) return;
    tone(150, { dur: 0.22, type: "sine", gain: 0.14 });
    buzz([50, 40, 50]);
  },
  stamp() {
    if (!isSfxOn()) return;
    noiseBurst({ dur: 0.08, gain: 0.28 });
    tone(90, { dur: 0.12, type: "sine", gain: 0.2 });
    buzz(80);
  },
  star(i = 0) {
    if (!isSfxOn()) return;
    tone(660 * Math.pow(1.2, i), { dur: 0.16, gain: 0.14 });
  },
  tick() {
    if (!isSfxOn()) return;
    tone(880, { dur: 0.04, type: "square", gain: 0.05 });
    buzz(15);
  },
  rare() {
    if (!isSfxOn()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { dur: 0.22, delay: i * 0.1, gain: 0.15 }));
    buzz([40, 30, 40, 30, 120]);
  },
};
