// Resistor divider and ESP32 ADC1 at 11 dB attenuation (spec §6.5).
import type { SimConfig } from '../types.ts';

/** Period (V) of the ADC's integral-nonlinearity bow, fixed by the formula in spec §6.5. */
export const ADC_INL_PERIOD_V = 3.1;

/** Divider output (V) for input `vIn_V` (V): `vIn · rBottom / (rTop + rBottom)`. */
export function dividerOut_V(vIn_V: number, cfg: SimConfig['sensors']['divider']): number {
  return (vIn_V * cfg.rBottom_ohm) / (cfg.rTop_ohm + cfg.rBottom_ohm);
}

/** 12-bit reading (counts) of pin voltage `vPin_V`, with INL and a noise sample `noise_counts` from the caller. */
export function adcCounts(vPin_V: number, cfg: SimConfig['sensors']['adc'], noise_counts: number): number {
  const linear = (cfg.maxCount * (vPin_V - cfg.vMin_V)) / cfg.vSpan_V;
  const inl = cfg.inl_counts * Math.sin((Math.PI * vPin_V) / ADC_INL_PERIOD_V);
  return Math.min(cfg.maxCount, Math.max(0, Math.round(linear + inl + noise_counts)));
}
