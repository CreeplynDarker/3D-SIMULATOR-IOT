import type { StateCreator } from 'zustand/vanilla';
import type { AppState } from '../index.ts';

/** Camera presets `cam-*` in M1 (spec §8.2). */
export type CameraPreset = 'overview' | 'fan' | 'esp32' | 'relay' | 'breadboard';
/** Viewport toggles `tgl-*` in M1 (spec §8.2). */
export type ViewToggle = 'flow' | 'labels' | 'airflow' | 'heat';
/** Bottom dock tabs: M6 charts, M7 console, M8 code, M10 test log (spec §8.1). */
export type DockTab = 'charts' | 'console' | 'code' | 'testlog';
export type Theme = 'dark' | 'light';

/** Range of `sld-vib-exaggeration` (×, spec §8.2). */
export const VIB_EXAGGERATION_RANGE = { min: 1, max: 50, initial: 10 } as const;

/** Bottom dock height: 280 px, resizable 160–480 px (spec §8.1). */
export const DOCK_HEIGHT_px = { min: 160, max: 480, initial: 280 } as const;

export interface UiSlice {
  ui: {
    selectedId: string | null;
    camera: CameraPreset;
    toggles: Record<ViewToggle, boolean>;
    vibExaggeration: number;
    dockTab: DockTab;
    theme: Theme;
    dockHeight_px: number;
    /** M12 legend and help modal. */
    legendOpen: boolean;
    /** Frames per second drawn by the 3D viewport. */
    fps: number;
    select(id: string | null): void;
    setCamera(camera: CameraPreset): void;
    setToggle(toggle: ViewToggle, on: boolean): void;
    setVibExaggeration(x: number): void;
    setDockTab(tab: DockTab): void;
    setTheme(theme: Theme): void;
    setDockHeight(px: number): void;
    setLegendOpen(open: boolean): void;
    setFps(fps: number): void;
  };
}

/** Viewport and layout choices that don't come from the sim (spec §10.3). */
export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => {
  const patch = (p: Partial<UiSlice['ui']>) => set((s) => ({ ui: { ...s.ui, ...p } }));
  const { min, max, initial } = VIB_EXAGGERATION_RANGE;
  return {
    ui: {
      selectedId: null,
      camera: 'overview',
      toggles: { flow: true, labels: true, airflow: false, heat: false },
      vibExaggeration: initial,
      dockTab: 'charts',
      theme: 'dark',
      dockHeight_px: DOCK_HEIGHT_px.initial,
      legendOpen: false,
      fps: 0,
      select: (selectedId) => patch({ selectedId }),
      setCamera: (camera) => patch({ camera }),
      setToggle: (toggle, on) => set((s) => ({ ui: { ...s.ui, toggles: { ...s.ui.toggles, [toggle]: on } } })),
      setVibExaggeration: (x) => patch({ vibExaggeration: Math.min(max, Math.max(min, x)) }),
      setDockTab: (dockTab) => patch({ dockTab }),
      setTheme: (theme) => patch({ theme }),
      setLegendOpen: (legendOpen) => patch({ legendOpen }),
      setFps: (fps) => patch({ fps }),
      setDockHeight: (px) => patch({ dockHeight_px: Math.min(DOCK_HEIGHT_px.max, Math.max(DOCK_HEIGHT_px.min, px)) }),
    },
  };
};
