// Firmware sampling (spec §7.1), driven by the 1 kHz tick. The firmware only sees the sampled sensor view and its own
// clock; the plant's DS18B20 runs the conversions the firmware requests on the same schedule.
import type { SensorsView } from '../sim/plant.ts';
import type { SimConfig } from '../sim/types.ts';

/** One feature window; a closed window's arrays stay valid for one whole window (two buffer sets alternate). */
export interface WindowData {
  /** Window k covers [k, k+1)·window_s. */
  index: number;
  tEnd_s: number;
  n: number;
  ax_g: Float64Array;
  ay_g: Float64Array;
  az_g: Float64Array;
  /** Raw GPIO34 ADC counts. */
  counts: Float64Array;
  /** PCNT rising edges counted during the window. */
  edges: number;
}

/** A DS18B20 register read (°C) at sim time `t_s`. */
export interface DsRead {
  t_s: number;
  value_C: number;
}

export interface SamplerState {
  samplesPerWindow: number;
  dsPeriodTicks: number;
  dsConversionTicks: number;
  sampleRate_Hz: number;
  window: WindowData;
  /** The other buffer set, filled while the last closed window is being read. */
  spare: WindowData;
  /** PCNT total when the window opened. */
  edgesAtOpen: number;
  /** A conversion is in flight (requested, not yet read). */
  dsPending: boolean;
}

/** Sampler at boot: window 0 open and empty. */
export function createSampler(cfg: SimConfig): SamplerState {
  const fw = cfg.firmware;
  const ds = cfg.sensors.ds18b20;
  const n = Math.round(fw.sampleRate_Hz * fw.window_s);
  const buffers = (): WindowData => ({
    index: 0,
    tEnd_s: fw.window_s,
    n: 0,
    ax_g: new Float64Array(n),
    ay_g: new Float64Array(n),
    az_g: new Float64Array(n),
    counts: new Float64Array(n),
    edges: 0,
  });
  return {
    samplesPerWindow: n,
    dsPeriodTicks: Math.round(ds.period_s * fw.sampleRate_Hz),
    dsConversionTicks: Math.round(ds.conversion_s * fw.sampleRate_Hz),
    sampleRate_Hz: fw.sampleRate_Hz,
    window: buffers(),
    spare: buffers(),
    edgesAtOpen: 0,
    dsPending: false,
  };
}

/**
 * One 1 kHz tick: closes the window when its end is reached (returned, then reused), appends this sample, and
 * requests/reads the DS18B20 on schedule.
 */
export function samplerTick(s: SamplerState, view: SensorsView): { window: WindowData | null; dsRead: DsRead | null } {
  const tick = Math.round(view.t_s * s.sampleRate_Hz);
  let closed: WindowData | null = null;
  if (tick > 0 && tick % s.samplesPerWindow === 0) {
    closed = s.window;
    closed.edges = view.tachEdges - s.edgesAtOpen;
    const next = s.spare;
    next.index = tick / s.samplesPerWindow;
    next.tEnd_s = (next.index + 1) * (s.samplesPerWindow / s.sampleRate_Hz);
    next.n = 0;
    next.edges = 0;
    s.window = next;
    s.spare = closed;
    s.edgesAtOpen = view.tachEdges;
  }
  const w = s.window;
  if (w.n < s.samplesPerWindow) {
    w.ax_g[w.n] = view.accel_g[0] as number;
    w.ay_g[w.n] = view.accel_g[1] as number;
    w.az_g[w.n] = view.accel_g[2] as number;
    w.counts[w.n] = view.adcCounts;
    w.n++;
  }
  let dsRead: DsRead | null = null;
  const phase = tick % s.dsPeriodTicks;
  if (phase === 0) s.dsPending = true; // request a conversion
  if (phase === s.dsConversionTicks && s.dsPending) {
    s.dsPending = false;
    dsRead = { t_s: view.t_s, value_C: view.dsReading_C };
  }
  return { window: closed, dsRead };
}
