// Sound for P6.3/P6.4, made with Web Audio oscillators (no audio files). It is off until the operator switches it on
// with `tgl-sound`; that click is the user gesture browsers require before an AudioContext may play.
import { CONFIG } from '../shared/config.ts';

const HUM = { baseGain: 0.03, gainPerG: 0.25, maxGain: 0.2, smoothing_s: 0.05 };
const CLICK = { freq_Hz: 2200, dur_s: 0.012, gain: 0.35 };

/** Hum pitch (Hz) at the blade-pass rate, and its gain (0…maxGain) from a_RMS (g); silent when stopped or paused. */
export function humFor(rpm: number, a_rms_g: number, playing: boolean): { freq_Hz: number; gain: number } {
  const freq_Hz = (rpm / 60) * CONFIG.fan.blades;
  if (!playing || rpm < 1) return { freq_Hz, gain: 0 };
  const level = Math.min(HUM.maxGain, HUM.baseGain + a_rms_g * HUM.gainPerG);
  return { freq_Hz, gain: level * Math.min(1, rpm / CONFIG.fan.rpmRated) };
}

let ctx: AudioContext | null = null;
let hum: { osc: OscillatorNode; gain: GainNode } | null = null;

/** Starts audio (call from a click handler). */
export function enableSound(): void {
  ctx ??= new AudioContext();
  void ctx.resume();
}

/** Silences everything. */
export function disableSound(): void {
  hum?.gain.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, HUM.smoothing_s);
  void ctx?.suspend();
}

/** A short relay click. */
export function playClick(): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const osc = new OscillatorNode(ctx, { type: 'square', frequency: CLICK.freq_Hz });
  const gain = new GainNode(ctx, { gain: CLICK.gain });
  gain.gain.exponentialRampToValueAtTime(0.001, t + CLICK.dur_s);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + CLICK.dur_s);
}

/** Sets the fan hum (Hz, 0…1 gain), creating its oscillator on first use. */
export function setHum(freq_Hz: number, gainLevel: number): void {
  if (!ctx || ctx.state !== 'running') return;
  if (!hum) {
    const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: Math.max(1, freq_Hz) });
    const gain = new GainNode(ctx, { gain: 0 });
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    hum = { osc, gain };
  }
  hum.osc.frequency.setTargetAtTime(Math.max(1, freq_Hz), ctx.currentTime, HUM.smoothing_s);
  hum.gain.gain.setTargetAtTime(gainLevel, ctx.currentTime, HUM.smoothing_s);
}
