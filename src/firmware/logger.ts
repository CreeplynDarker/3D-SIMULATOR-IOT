// Firmware log lines (spec §7.7): `[t=000123.456] LEVEL module: message`.

export type LogLevel = 'INFO' | 'WARN' | 'ERR';

/** Width of the time stamp: six integer digits, a point, three decimals. */
const STAMP_WIDTH = 10;

/** Formats one log line for sim time `t_s` (s). */
export function formatLog(t_s: number, level: LogLevel, module: string, message: string): string {
  return `[t=${t_s.toFixed(3).padStart(STAMP_WIDTH, '0')}] ${level} ${module}: ${message}`;
}

export interface Logger {
  lines: string[];
  log(t_s: number, level: LogLevel, module: string, message: string): void;
}

/** Collects formatted lines until the caller drains them. */
export function createLogger(): Logger {
  const lines: string[] = [];
  return { lines, log: (t_s, level, module, message) => lines.push(formatLog(t_s, level, module, message)) };
}
