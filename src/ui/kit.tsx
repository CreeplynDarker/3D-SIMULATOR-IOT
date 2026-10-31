// Small presentational building blocks shared by the UI modules. They hold no state of their own.
import type { ReactNode } from 'react';

/** A titled panel inside a side column. */
export function Panel({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="border-b border-slate-300 p-3 dark:border-slate-700">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

/** An on/off button with `aria-pressed`. */
export function ToggleButton(props: {
  testId: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-pressed={props.on}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.on)}
      className="rounded border border-slate-400 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-40 aria-pressed:border-sky-600 aria-pressed:bg-sky-600 aria-pressed:text-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {props.label}
    </button>
  );
}

/** A plain push button. `tone` colours the important ones (start, e-stop, reset). */
export function Button(props: {
  testId: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'go' | 'stop' | 'warn';
  title?: string;
}) {
  const tone = {
    default:
      'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
    go: 'bg-emerald-600 text-white hover:bg-emerald-500',
    stop: 'bg-red-600 text-white hover:bg-red-500',
    warn: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
  }[props.tone ?? 'default'];
  return (
    <button
      type="button"
      data-testid={props.testId}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {props.children}
    </button>
  );
}
