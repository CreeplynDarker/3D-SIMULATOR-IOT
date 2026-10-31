// Live mode status over the viewport (P8.2): connecting, connected, or what to do when no bridge answers (D-072).
import { useAppStore } from '../store/index.ts';

export function LiveBanner() {
  const source = useAppStore((s) => s.sim.source);
  const live = useAppStore((s) => s.sim.live);
  const packets = useAppStore((s) => s.sim.snapshot?.traffic.packets ?? 0);
  if (source !== 'live') return null;
  const ok = live.status === 'open';
  const text =
    live.status === 'connecting'
      ? 'Live: connecting to the bridge…'
      : ok
        ? `Live: the board through the bridge · ${packets} packets`
        : (live.message ?? 'Live: not connected');
  return (
    <div
      data-testid="live-banner"
      data-status={live.status}
      role="status"
      className={`absolute left-1/2 top-3 max-w-[70%] -translate-x-1/2 rounded px-3 py-1.5 text-xs shadow ${ok ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-slate-950'}`}
    >
      {text}
    </div>
  );
}
