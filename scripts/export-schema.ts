// pnpm gen:schema [outDir] — writes the JSON Schema of each wire message (spec §10.1) to public/schema/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Command, Packet, PROTOCOL_VERSION, Verdict } from '../src/shared/protocol.ts';

const outDir = resolve(process.argv[2] ?? join(import.meta.dirname, '../public/schema'));
const schemas = { packet: Packet, verdict: Verdict, command: Command };

mkdirSync(outDir, { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  const json = { ...z.toJSONSchema(schema), title: name, description: `PROTOCOL_VERSION ${PROTOCOL_VERSION}` };
  const file = join(outDir, `${name}.schema.json`);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  process.stdout.write(`wrote ${file}\n`);
}
