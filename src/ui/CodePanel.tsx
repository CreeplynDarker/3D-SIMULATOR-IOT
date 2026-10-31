// M8 code panel (spec §7.6, §8.2): read-only, syntax-coloured reference C++, protocol and RCF sources. The line
// whose `// @map` marker equals the firmware's `activeMap` carries `data-active="true"`; with `tgl-follow` on, the
// panel jumps to it whenever the firmware takes a new decision.
import { useEffect, useMemo, useRef } from 'react';
import { appStore, useAppStore } from '../store/index.ts';
import { CODE_FILES, type CodeTab, findMarker, type TokenKind, tokenize } from './highlight.ts';
import { ToggleButton } from './kit.tsx';

const TABS: { id: CodeTab; label: string }[] = [
  { id: 'firmware', label: 'ESP32 firmware (C++)' },
  { id: 'schema', label: 'Protocol' },
  { id: 'rcf', label: 'RCF (laptop)' },
];
const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  keyword: 'text-violet-600 dark:text-violet-400 font-semibold',
  comment: 'text-slate-400 dark:text-slate-500 italic',
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-amber-700 dark:text-amber-300',
  preproc: 'text-sky-700 dark:text-sky-400',
};
const TAB = 'rounded px-2 py-0.5 text-xs aria-selected:bg-sky-600 aria-selected:text-white';

/** Jumps to the active marker's file when `follow` is on and the firmware's `activeMap` changes. */
function useFollow(activeMap: string | null, follow: boolean) {
  useEffect(() => {
    const at = findMarker(activeMap);
    if (follow && at) appStore.getState().ui.setCode({ tab: 'firmware', file: at.file });
  }, [activeMap, follow]);
}

/** The M8 tab. */
export function CodePanel() {
  const activeMap = useAppStore((s) => s.sim.snapshot?.activeMap ?? null);
  const code = useAppStore((s) => s.ui.code);
  const set = appStore.getState().ui.setCode;
  useFollow(activeMap, code.follow);
  const files = CODE_FILES[code.tab];
  const file = files.find((f) => f.name === code.file) ?? (files[0] as (typeof files)[number]);
  const lines = useMemo(() => tokenize(file.text, file.lang), [file]);
  const marker = findMarker(activeMap);
  const activeLine = marker && marker.file === file.name && code.tab === 'firmware' ? marker.line : -1;
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (code.follow) activeRef.current?.scrollIntoView({ block: 'center' });
  }, [activeLine, file.name, code.follow]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 px-2 py-1 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-testid={`tab-code-${t.id}`}
            aria-selected={code.tab === t.id}
            className={TAB}
            onClick={() => set({ tab: t.id, file: (CODE_FILES[t.id][0] as { name: string }).name })}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 h-4 border-l border-slate-300 dark:border-slate-700" />
        {files.map((f) => (
          <button
            key={f.name}
            type="button"
            role="tab"
            data-testid={`code-file-${f.name}`}
            aria-selected={file.name === f.name}
            className={TAB}
            onClick={() => set({ file: f.name })}
          >
            {f.name}
          </button>
        ))}
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-slate-500">active: {activeMap ?? '—'}</span>
        <ToggleButton testId="tgl-follow" label="Follow" on={code.follow} onChange={(follow) => set({ follow })} />
      </div>
      <div
        data-testid="code-panel"
        data-file={file.name}
        className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[11px] leading-4"
      >
        {lines.map((tokens, i) => (
          <div
            key={i}
            ref={i === activeLine ? activeRef : undefined}
            data-active={i === activeLine ? 'true' : undefined}
            data-map={i === activeLine ? (activeMap ?? undefined) : undefined}
            className={`flex whitespace-pre ${i === activeLine ? 'bg-amber-200/70 dark:bg-amber-500/30' : ''}`}
          >
            <span className="w-10 shrink-0 select-none pr-2 text-right text-slate-400">{i + 1}</span>
            <span>
              {tokens.map((t, k) => (
                <span key={k} className={TOKEN_CLASS[t.kind]}>
                  {t.text}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
