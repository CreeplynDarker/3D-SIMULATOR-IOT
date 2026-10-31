// M8 code panel content (spec §7.6, §8.2): the reference C++, the protocol and the RCF sources (Vite `?raw`), a
// small tokenizer for syntax colouring (comments, strings, numbers, keywords, preprocessor), and the `@map` lookup.
import featuresCpp from '../firmware/reference-cpp/features.cpp?raw';
import mainCpp from '../firmware/reference-cpp/main.cpp?raw';
import relayCpp from '../firmware/reference-cpp/relay.cpp?raw';
import stateMachineCpp from '../firmware/reference-cpp/state_machine.cpp?raw';
import modelTs from '../rcf/model.ts?raw';
import rrcfTs from '../rcf/rrcf.ts?raw';
import protocolTs from '../shared/protocol.ts?raw';

export type Lang = 'cpp' | 'ts';
export type TokenKind = 'plain' | 'keyword' | 'comment' | 'string' | 'number' | 'preproc';
export interface Token {
  kind: TokenKind;
  text: string;
}
export interface CodeFile {
  name: string;
  lang: Lang;
  text: string;
}
export type CodeTab = 'firmware' | 'schema' | 'rcf';

export const CODE_FILES: Record<CodeTab, CodeFile[]> = {
  firmware: [
    { name: 'main.cpp', lang: 'cpp', text: mainCpp },
    { name: 'features.cpp', lang: 'cpp', text: featuresCpp },
    { name: 'state_machine.cpp', lang: 'cpp', text: stateMachineCpp },
    { name: 'relay.cpp', lang: 'cpp', text: relayCpp },
  ],
  schema: [{ name: 'protocol.ts', lang: 'ts', text: protocolTs }],
  rcf: [
    { name: 'model.ts', lang: 'ts', text: modelTs },
    { name: 'rrcf.ts', lang: 'ts', text: rrcfTs },
  ],
};

const KEYWORDS: Record<Lang, ReadonlySet<string>> = {
  cpp: new Set(
    'auto bool break case char class const constexpr continue default do double else enum extern false float for if inline int int8_t int16_t int32_t int64_t long namespace nullptr private public return short signed size_t sizeof static struct switch true typedef uint8_t uint16_t uint32_t uint64_t unsigned using void volatile while'.split(' '), // prettier-ignore
  ),
  ts: new Set(
    'as async await break case catch class const continue default else enum export extends false finally for from function if import in instanceof interface let new null of private public readonly return static switch this throw true try type typeof undefined void while'.split(' '), // prettier-ignore
  ),
};

const NUMBER = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)[uUlLfF]*/;
const WORD = /^[A-Za-z_]\w*/;

/** Splits `src` into lines of tokens; joining every token's text gives back the source exactly. */
export function tokenize(src: string, lang: Lang): Token[][] {
  const lines: Token[][] = [[]];
  const push = (kind: TokenKind, text: string) => {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (!part) return;
      const line = lines[lines.length - 1] as Token[];
      const last = line[line.length - 1];
      if (last && last.kind === kind && kind === 'plain') last.text += part;
      else line.push({ kind, text: part });
    });
  };
  let i = 0;
  let lineStart = true;
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i] as string;
    let m: RegExpMatchArray | null;
    if (rest.startsWith('//')) m = rest.match(/^\/\/[^\n]*/);
    else if (rest.startsWith('/*')) m = rest.match(/^\/\*[\s\S]*?(?:\*\/|$)/);
    else m = null;
    if (m) {
      push('comment', m[0]);
    } else if (lang === 'cpp' && lineStart && ch === '#' && (m = rest.match(/^#[^\n]*/))) {
      push('preproc', m[0]);
    } else if ((ch === '"' || ch === "'" || (lang === 'ts' && ch === '`')) && (m = rest.match(stringPattern(ch)))) {
      push('string', m[0]);
    } else if (/\d/.test(ch) && !/\w/.test(src[i - 1] ?? '') && (m = rest.match(NUMBER))) {
      push('number', m[0]);
    } else if ((m = rest.match(WORD))) {
      push(KEYWORDS[lang].has(m[0]) ? 'keyword' : 'plain', m[0]);
    } else {
      m = [ch];
      push('plain', ch);
    }
    i += m[0].length;
    const last = m[0][m[0].length - 1];
    if (last === '\n') lineStart = true;
    else if (!/\s/.test(m[0])) lineStart = false;
  }
  return lines;
}

/** A quoted string with backslash escapes; ' and " end at the line end if unclosed, ` may span lines. */
function stringPattern(q: string): RegExp {
  return q === '`' ? /^`(?:\\[\s\S]|[^\\`])*`?/ : new RegExp(`^${q}(?:\\\\.|[^\\\\${q}\\n])*${q}?`);
}

/** The firmware file and 0-based line that carry `// @map <id>`, or null. */
export function findMarker(id: string | null): { file: string; line: number } | null {
  if (!id) return null;
  const marker = new RegExp(`// @map ${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
  for (const f of CODE_FILES.firmware) {
    const line = f.text.split('\n').findIndex((l) => marker.test(l));
    if (line >= 0) return { file: f.name, line };
  }
  return null;
}
