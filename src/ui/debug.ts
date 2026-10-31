// JSON-safe view of the store for the e2e tests (`window.__pdm.inspect()`, only with `?debug=1`).
import type { AppState } from '../store/index.ts';

/** The parts of the store the e2e tests check, as plain data. */
export function inspectStore(s: AppState) {
  return {
    sim: { playing: s.sim.playing, speed: s.sim.speed, lagging: s.sim.lagging, t_s: s.sim.snapshot?.t_s ?? null, state: s.sim.snapshot?.state ?? null }, // prettier-ignore
    ui: {
      selectedId: s.ui.selectedId,
      camera: s.ui.camera,
      toggles: { ...s.ui.toggles },
      vibExaggeration: s.ui.vibExaggeration,
      dockTab: s.ui.dockTab,
      dockHeight_px: s.ui.dockHeight_px,
      theme: s.ui.theme,
    },
    model: { status: s.model.status, progress: s.model.progress, threshold: s.model.threshold },
  };
}

export type StoreView = ReturnType<typeof inspectStore>;
