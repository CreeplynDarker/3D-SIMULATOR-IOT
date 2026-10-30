// Shared sim types. The plant takes the config as a parameter so tests and the worker's `init` can pass a tuned
// copy; `SimConfig` is `Config` with its literal types widened.
import type { Config } from '../shared/config.ts';

type Widen<T> = T extends number
  ? number
  : T extends boolean
    ? boolean
    : T extends string
      ? string
      : T extends readonly (infer U)[]
        ? readonly Widen<U>[]
        : { readonly [K in keyof T]: Widen<T[K]> };

export type SimConfig = Widen<Config>;

/** ESP32 pin level: 0 = LOW, 1 = HIGH. Relay IN2 is active LOW (§6.8). */
export type GpioLevel = 0 | 1;
export const GPIO_LOW: GpioLevel = 0;
export const GPIO_HIGH: GpioLevel = 1;
