// M1 viewport overlay (spec §8.2): view toggles and the vibration exaggeration slider. P6 draws what they enable.
import { appStore, useAppStore } from '../store/index.ts';
import { VIB_EXAGGERATION_RANGE, type ViewToggle } from '../store/slices/ui.ts';
import { ToggleButton } from './kit.tsx';

const TOGGLES: { key: ViewToggle; label: string }[] = [
  { key: 'flow', label: 'Flow' },
  { key: 'labels', label: 'Labels' },
  { key: 'airflow', label: 'Airflow' },
  { key: 'heat', label: 'Heat' },
];

/** Toggles `tgl-*` and `sld-vib-exaggeration` over the bottom-right of the viewport. */
export function ViewportControls() {
  const toggles = useAppStore((s) => s.ui.toggles);
  const vib = useAppStore((s) => s.ui.vibExaggeration);
  const ui = appStore.getState().ui;
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded bg-white/80 px-2 py-1 dark:bg-slate-900/80">
      {TOGGLES.map((t) => (
        <ToggleButton
          key={t.key}
          testId={`tgl-${t.key}`}
          label={t.label}
          on={toggles[t.key]}
          onChange={(on) => ui.setToggle(t.key, on)}
        />
      ))}
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
        Vibration ×{vib}
        <input
          data-testid="sld-vib-exaggeration"
          type="range"
          min={VIB_EXAGGERATION_RANGE.min}
          max={VIB_EXAGGERATION_RANGE.max}
          step={1}
          value={vib}
          onChange={(e) => ui.setVibExaggeration(Number(e.target.value))}
          className="w-24"
        />
      </label>
    </div>
  );
}
