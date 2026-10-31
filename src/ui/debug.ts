// JSON-safe view of the store for the e2e tests (`window.__pdm.inspect()`, only with `?debug=1`).
import type { SimEvent } from '../shared/messages.ts';
import type { AppState } from '../store/index.ts';

/** The parts of the store the e2e tests check, as plain data. */
export function inspectStore(s: AppState) {
  return {
    sim: {
      playing: s.sim.playing,
      speed: s.sim.speed,
      lagging: s.sim.lagging,
      t_s: s.sim.snapshot?.t_s ?? null,
      state: s.sim.snapshot?.state ?? null,
      scenario: s.sim.scenario,
    },
    ui: {
      selectedId: s.ui.selectedId,
      camera: s.ui.camera,
      toggles: { ...s.ui.toggles },
      vibExaggeration: s.ui.vibExaggeration,
      dockTab: s.ui.dockTab,
      dockHeight_px: s.ui.dockHeight_px,
      theme: s.ui.theme,
      legendOpen: s.ui.legendOpen,
      chartWindow_s: s.ui.chartWindow_s,
      chartFrozen: s.ui.chartFrozen,
    },
    faults: { targets: { ...s.ui.faultTargets }, ramp: { ...s.ui.ramp }, live: s.sim.snapshot ? { ...s.sim.snapshot.faults } : null }, // prettier-ignore
    operator: { ...s.ui.operator, resetDialogOpen: s.ui.resetDialogOpen },
    console: {
      paused: s.console.paused,
      filters: { ...s.console.filters },
      packets: s.console.lines.toArray().filter((e) => e.kind === 'packet').length,
      lines: s.console.lines.size,
    },
    raw: { ...s.sim.raw },
    model: { status: s.model.status, progress: s.model.progress, threshold: s.model.threshold },
  };
}

export type StoreView = ReturnType<typeof inspectStore>;

/** `window.__sim` (§8.2): live getters for Playwright. */
export interface SimDebug {
  readonly fps: number;
  readonly state: string | null;
  readonly t_s: number;
  readonly scenarioDone: boolean;
  readonly lastEvent: SimEvent | null;
}

/** Builds `window.__sim` over the store; every read is live. */
export function simDebug(get: () => AppState): SimDebug {
  return {
    get fps() {
      return get().ui.fps;
    },
    get state() {
      return get().sim.snapshot?.state ?? null;
    },
    get t_s() {
      return get().sim.snapshot?.t_s ?? 0;
    },
    get scenarioDone() {
      return get().sim.scenario?.done ?? false;
    },
    get lastEvent() {
      return get().series.events.last() ?? null;
    },
  };
}
