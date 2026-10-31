// Guided scenarios for M11 (spec §8.2, §12): the text of each step, as data the team can edit without touching a
// component. A step shows once its trigger fires: a sim time, the first event of a type (plus an offset), or the end
// of the run. Each step names the camera preset to switch to and the M6 chart to watch.
import type { CONFIG } from './config.ts';
import type { SimEvent, SimEventType } from './messages.ts';

export type GuidedCamera = 'overview' | 'fan' | 'esp32' | 'relay' | 'breadboard';
export type GuidedChart = 'chart-arms' | 'chart-cf' | 'chart-irms' | 'chart-temp' | 'chart-rpm' | 'chart-score';
export type GuidedTrigger = { t_s: number } | { event: SimEventType; after_s?: number } | { done: true };

export interface GuidedStep {
  when: GuidedTrigger;
  title: string;
  camera: GuidedCamera;
  chart: GuidedChart;
  /** What to look at. */
  watch: string;
  /** What has been injected so far. */
  injected: string;
  /** What the firmware state means right now. */
  meaning: string;
}

export interface GuidedScenario {
  id: string;
  /** Sim speed for the run, chosen so it takes at most about 90 s of wall time. */
  speed: (typeof CONFIG.ui.speeds)[number];
  steps: GuidedStep[];
}

const START_STEP: GuidedStep = {
  when: { t_s: 0 },
  title: 'START',
  camera: 'overview',
  chart: 'chart-rpm',
  watch: 'The relay CH2 LED lights and the fan spins up on the RPM chart.',
  injected: 'Nothing: a healthy fan.',
  meaning: 'CALIBRATING measures the current sensor at zero (relay open), then STARTING closes CH2 and gives the fan 10 s to reach speed. RCF verdicts are ignored meanwhile.', // prettier-ignore
};

const normalStep = (chart: GuidedChart, watch: string): GuidedStep => ({
  when: { event: 'NORMAL' },
  title: 'NORMAL: the baseline',
  camera: 'fan',
  chart,
  watch,
  injected: 'Nothing yet.',
  meaning: 'NORMAL: the ESP32 sends one feature packet per second and the laptop RCF scores it. Scores stay well under the 0.50 threshold.', // prettier-ignore
});

const warningStep = (chart: GuidedChart, watch: string, injected: string): GuidedStep => ({
  when: { event: 'WARNING' },
  title: 'WARNING: the score crosses the threshold',
  camera: 'overview',
  chart,
  watch,
  injected,
  meaning: 'WARNING: an alert verdict arrived. The status panel counts consecutive alerts (persistence k/5); five in a row trip the relay.', // prettier-ignore
});

const criticalStep = (watch: string, injected: string, meaning: string): GuidedStep => ({
  when: { event: 'CRITICAL' },
  title: 'CRITICAL: the ESP32 opens relay CH2',
  camera: 'relay',
  chart: 'chart-rpm',
  watch,
  injected,
  meaning,
});

const RCF_TRIP =
  'CRITICAL: on the fifth alert the ESP32 drives GPIO26 HIGH, the CH2 arm swings back to NC and the 12 V wire to the fan (W04) goes dark. The trip is latched.'; // prettier-ignore

const doneStep = (watch: string, injected: string, meaning: string): GuidedStep => ({
  when: { done: true },
  title: 'End of the run',
  camera: 'overview',
  chart: 'chart-score',
  watch,
  injected,
  meaning,
});

const LATCHED = 'The fan stays off until the operator presses RESET (accepted below 100 rpm) and then START.';

export const GUIDED: readonly GuidedScenario[] = [
  {
    id: 'S1',
    speed: 10,
    steps: [
      START_STEP,
      normalStep('chart-score', 'The RCF score strip stays low; the dashed line is the 0.50 threshold.'),
      {
        when: { t_s: 120 },
        title: 'Every feature holds still',
        camera: 'breadboard',
        chart: 'chart-arms',
        watch: 'a_RMS, crest factor, current, temperature and RPM all wobble only by sensor noise.',
        injected: 'Nothing.',
        meaning: 'NORMAL: each verdict is "clear", so the persistence counter stays at 0/5.',
      },
      doneStep('Ten minutes of sim time with no CRITICAL and at most two alert verdicts.', 'Nothing.', 'NORMAL to the end: a healthy fan does not trip.'), // prettier-ignore
    ],
  },
  {
    id: 'S2',
    speed: 4,
    steps: [
      START_STEP,
      normalStep('chart-arms', 'a_RMS sits near 0.12 g; that is the residual imbalance of a healthy fan.'),
      {
        when: { t_s: 60 },
        title: 'Imbalance injected',
        camera: 'fan',
        chart: 'chart-arms',
        watch: 'The frame shakes harder and a_RMS jumps about five times; the current hardly moves.',
        injected: 'Imbalance 0.3 g (a mass on one blade), as a step at t = 60 s.',
        meaning: 'Still NORMAL: the ESP32 waits for the next 1 s window and the RCF verdict.',
      },
      warningStep('chart-score', 'The score leaps over the threshold; the dominant variable reads a_rms_g.', 'Imbalance 0.3 g.'), // prettier-ignore
      criticalStep('The relay arm moves, W04 dims and the RPM falls toward zero.', 'Imbalance 0.3 g.', RCF_TRIP),
      doneStep('The fan has coasted to a stop.', 'Imbalance 0.3 g (still set).', LATCHED),
    ],
  },
  {
    id: 'S4',
    speed: 4,
    steps: [
      START_STEP,
      normalStep('chart-irms', 'I_RMS sits near 0.18 A.'),
      {
        when: { t_s: 60 },
        title: 'Friction ramps up',
        camera: 'fan',
        chart: 'chart-rpm',
        watch: 'RPM sags while the current climbs on the I_RMS strip.',
        injected: 'Bearing friction rising from 0 to 0.5 over 30 s.',
        meaning: 'NORMAL until the deviation is large enough for the RCF to isolate it.',
      },
      warningStep('chart-irms', 'The dominant variable is i_rms_A or rpm.', 'Friction ramping to 0.5.'),
      criticalStep('The relay opens and the fan stops.', 'Friction ramping to 0.5.', 'CRITICAL: tripped by the RCF (or, if the current stays above 0.30 A for 3 windows, by the local I_MAX limit). The trip is latched.'), // prettier-ignore
      doneStep('The friction stays, so a restart would trip again.', 'Friction 0.5.', LATCHED),
    ],
  },
  {
    id: 'S5',
    speed: 4,
    steps: [
      START_STEP,
      normalStep('chart-temp', 'The motor sits at 34 °C with dT/dt near zero.'),
      {
        when: { t_s: 60 },
        title: 'Overheat injected',
        camera: 'fan',
        chart: 'chart-temp',
        watch: 'Turn on Heat to tint the hub; dT/dt (second axis) climbs first, then T.',
        injected: 'Overheat 1.0: the air around the motor gets 35 °C hotter.',
        meaning: 'NORMAL: still far below the 60 °C local limit.',
      },
      warningStep('chart-score', 'The dominant variable is t_C or dtdt_C_per_min.', 'Overheat 1.0.'),
      criticalStep('The relay opens long before the motor reaches 60 °C.', 'Overheat 1.0.', RCF_TRIP),
      doneStep('The RCF caught the trend minutes before the T_MAX limit would have.', 'Overheat 1.0.', LATCHED),
    ],
  },
  {
    id: 'S6',
    speed: 10,
    steps: [
      START_STEP,
      normalStep('chart-score', 'One packet up the Wi-Fi arc and one verdict down, every second.'),
      {
        when: { t_s: 30 },
        title: 'Wi-Fi drops every packet',
        camera: 'overview',
        chart: 'chart-score',
        watch: 'The Wi-Fi arc flashes red; the score strip gets no new points.',
        injected: 'Packet loss 100 % from t = 30 s.',
        meaning: 'NORMAL: the ESP32 keeps sampling and enforcing its local limits.',
      },
      {
        when: { event: 'LINK_LOST' },
        title: 'Link lost',
        camera: 'esp32',
        chart: 'chart-score',
        watch: 'The status panel shows "link lost".',
        injected: 'Packet loss 100 %.',
        meaning: 'No verdict for 5 s: link_lost is set and the RCF rules pause. Only the local limits can trip now.',
      },
      {
        when: { t_s: 60 },
        title: 'Overheat with no laptop',
        camera: 'fan',
        chart: 'chart-temp',
        watch: 'T climbs toward the 60 °C line; nothing on the laptop can react.',
        injected: 'Packet loss 100 % and overheat 1.0 from t = 60 s.',
        meaning: 'NORMAL, then WARNING (T_SOFT) above 55 °C.',
      },
      criticalStep('The relay opens on the ESP32 alone.', 'Packet loss 100 % and overheat 1.0.', 'CRITICAL (T_MAX): the probe read above 60 °C, so the firmware tripped locally, about 5 minutes into the run. The trip is latched.'), // prettier-ignore
      doneStep('The local limit protected the fan without the laptop.', 'Packet loss 100 % and overheat 1.0.', LATCHED),
    ],
  },
  {
    id: 'S9',
    speed: 10,
    steps: [
      START_STEP,
      normalStep('chart-score', 'Watch the score strip for false alarms at 10× speed.'),
      {
        when: { t_s: 300 },
        title: 'Halfway: still quiet',
        camera: 'esp32',
        chart: 'chart-score',
        watch: 'Scores stay under the dashed threshold line.',
        injected: 'Nothing.',
        meaning: 'NORMAL: any single alert would show as WARNING, and it clears after 3 quiet verdicts.',
      },
      doneStep('Ten minutes with no trip: the threshold leaves room for normal noise.', 'Nothing.', 'NORMAL to the end.'), // prettier-ignore
    ],
  },
];

/** The guided script for scenario `id`, or null if it isn't guided. */
export function guidedFor(id: string): GuidedScenario | null {
  return GUIDED.find((g) => g.id === id) ?? null;
}

/** Index of the furthest step whose trigger has fired, given sim time (s), the run's events and whether it ended. */
export function reachedStep(
  steps: readonly GuidedStep[],
  at: { t_s: number; events: readonly SimEvent[]; done: boolean },
): number {
  // prettier-ignore
  let reached = 0;
  steps.forEach((s, i) => {
    const w = s.when;
    const fired =
      'done' in w
        ? at.done
        : 'event' in w
          ? at.events.some((e) => e.type === w.event && at.t_s >= e.t_s + (w.after_s ?? 0))
          : at.t_s >= w.t_s;
    if (fired) reached = i;
  });
  return reached;
}
