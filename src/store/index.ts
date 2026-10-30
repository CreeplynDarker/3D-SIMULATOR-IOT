import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { type ConsoleSlice, createConsoleSlice } from './slices/console.ts';
import { createModelSlice, type ModelSlice } from './slices/model.ts';
import { createSeriesSlice, type SeriesSlice } from './slices/series.ts';
import { createSimSlice, type SimSlice } from './slices/sim.ts';
import { createTestlogSlice, type TestlogSlice } from './slices/testlog.ts';
import { createUiSlice, type UiSlice } from './slices/ui.ts';

export type AppState = SimSlice & SeriesSlice & ConsoleSlice & ModelSlice & UiSlice & TestlogSlice;

/** Creates a fresh vanilla store (tests make one each; the app uses `appStore`). */
export function createAppStore() {
  return createStore<AppState>()((...a) => ({
    ...createSimSlice(...a),
    ...createSeriesSlice(...a),
    ...createConsoleSlice(...a),
    ...createModelSlice(...a),
    ...createUiSlice(...a),
    ...createTestlogSlice(...a),
  }));
}

export type AppStore = ReturnType<typeof createAppStore>;

/** The app's single store. The 3D scene reads it with `appStore.getState()` inside `useFrame`. */
export const appStore: AppStore = createAppStore();

/** React hook: subscribes a component to a slice of the app store via `selector`. */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
