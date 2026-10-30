import { useSettings } from '../store/settingsStore.ts';

// Bunyi pendek yang disintesis Web Audio: tanpa file suara yang perlu diunduh.

export type SoundName = 'move' | 'capture' | 'check' | 'end' | 'chat';

type Tone = {
  freq: number;
  /** Frekuensi akhir (nada menurun/naik); tanpa ini nada tetap. */
  to?: number;
  /** Mulai, detik setelah bunyi diputar. */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain: number;
};

const SOUNDS: Record<SoundName, Tone[]> = {
  move: [{ freq: 440, to: 260, at: 0, dur: 0.07, type: 'triangle', gain: 0.35 }],
  capture: [
    { freq: 320, to: 140, at: 0, dur: 0.11, type: 'triangle', gain: 0.45 },
    { freq: 560, to: 300, at: 0.02, dur: 0.06, type: 'triangle', gain: 0.2 },
  ],
  check: [
    { freq: 880, at: 0, dur: 0.08, gain: 0.22 },
    { freq: 1175, at: 0.09, dur: 0.1, gain: 0.22 },
  ],
  end: [
    { freq: 523, at: 0, dur: 0.14, gain: 0.22 },
    { freq: 659, at: 0.12, dur: 0.14, gain: 0.22 },
    { freq: 784, at: 0.24, dur: 0.32, gain: 0.22 },
  ],
  chat: [
    { freq: 990, at: 0, dur: 0.06, gain: 0.12 },
    { freq: 1320, at: 0.07, dur: 0.08, gain: 0.12 },
  ],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // Browser menahan audio sampai pengguna berinteraksi dengan halaman.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null; // Web Audio tidak tersedia: permainan tetap jalan tanpa suara.
  }
}

export function playSound(name: SoundName) {
  if (useSettings.getState().muted) return;
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + 0.01;
  for (const tone of SOUNDS[name]) {
    const t0 = start + tone.at;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.freq, t0);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + tone.dur + 0.02);
  }
}

// Siapkan audio pada interaksi pertama, agar langkah lawan yang datang
// sesudahnya (tanpa interaksi) tetap terdengar.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!useSettings.getState().muted) audio();
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}
