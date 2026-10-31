import { describe, expect, it } from 'vitest';
import { CODE_FILES, findMarker, tokenize } from '../../../src/ui/highlight.ts';

const kinds = (line: { kind: string; text: string }[]) => line.filter((t) => t.text.trim()).map((t) => `${t.kind}:${t.text.trim()}`); // prettier-ignore

describe('M8 C++ highlighter (P6.5)', () => {
  it('marks comments, strings, numbers and keywords; keeps every character', () => {
    const src = 'static const int N = 1000; // window\nif (x > 0.5f) log("a \\"b\\"");\n#include <Wire.h>';
    const lines = tokenize(src, 'cpp');
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(src);
    expect(kinds(lines[0] ?? [])).toEqual(['keyword:static', 'keyword:const', 'keyword:int', 'plain:N =', 'number:1000', 'plain:;', 'comment:// window']); // prettier-ignore
    expect(kinds(lines[1] ?? [])).toContain('number:0.5f');
    expect(kinds(lines[1] ?? [])).toContain('string:"a \\"b\\""');
    expect(kinds(lines[2] ?? [])).toEqual(['preproc:#include <Wire.h>']);
  });

  it('carries a block comment across lines; TS gets its own keywords and template strings', () => {
    const lines = tokenize('a /* one\ntwo */ b 0x1F', 'cpp');
    expect(kinds(lines[0] ?? [])).toEqual(['plain:a', 'comment:/* one']);
    expect(kinds(lines[1] ?? [])).toEqual(['comment:two */', 'plain:b', 'number:0x1F']);
    expect(kinds(tokenize('export const s = `x${1}`;', 'ts')[0] ?? [])).toEqual(['keyword:export', 'keyword:const', 'plain:s =', 'string:`x${1}`', 'plain:;']); // prettier-ignore
  });

  it('finds the line that carries a // @map marker, and only an exact id', () => {
    const at = findMarker('sm.warn.trip');
    expect(at?.file).toBe('state_machine.cpp');
    const text = CODE_FILES.firmware.find((f) => f.name === at?.file)?.text.split('\n')[at?.line ?? -1];
    expect(text).toMatch(/\/\/ @map sm\.warn\.trip\b/);
    expect(findMarker('sm.warn')).toBeNull();
    expect(findMarker(null)).toBeNull();
    for (const id of ['sm.off.start', 'relay.on', 'feat.arms', 'link.lost']) expect(findMarker(id), id).not.toBeNull();
  });
});
