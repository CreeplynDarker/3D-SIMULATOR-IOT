// M9 inspector content (spec §8.2): name, photo crop, key specs (§1.2, §1.3), pins with live values from the
// snapshot, and the component's wires (§13.3). It formats snapshot values; it computes nothing.
import { bbNodeOf, type ComponentId, componentById } from '../shared/components.ts';
import type { ModelStatus, Snapshot } from '../shared/messages.ts';
import { type Wire, WIRES, RESISTOR_LINKS } from '../shared/wiring.ts';

export interface InspectorInfo {
  name: string;
  /** Photo crop under `public/`, or null. */
  photo: string | null;
  specs: string[];
  pins: { text: string }[];
  wires: Wire[];
}

const PHOTOS: Partial<Record<ComponentId, string>> = {
  fan: 'textures/fan-hub.webp',
  esp32: 'textures/esp32-pcb.webp',
  acs712: 'textures/acs712-pcb.webp',
  relay: 'textures/relay-pcb.webp',
  adapter: 'textures/adapter-label.webp',
};

const SPECS: Record<ComponentId, string[]> = {
  fan: ['12 VDC (4.0–13.8 V), 3,800 rpm, 0.18 A typical', '70 × 70 × 15 mm, 47 g, 7 blades', 'Wires: red +12 V (NO2), black GND, blue tach left free (no speed sensing)'], // prettier-ignore
  mpu6050: ['GY-521: MPU6050, on-board 3.3 V regulator and 2.2 kΩ I²C pull-ups', '±2 g, 16,384 LSB/g, DLPF 184 Hz', 'I²C 0x68: SDA GPIO21 (via A45/B45), SCL GPIO22 (via A46/B46), VCC from the 3V3 rail', 'Pins VCC GND SCL SDA XDA XCL AD0 INT; XDA, XCL, AD0, INT free (AD0 low: 0x68)', 'Rigidly fixed to the fan housing: X, Y in the fan plane (Y up), Z along the fan axis'], // prettier-ignore
  ds18b20: ['12-bit, 0.0625 °C, 750 ms conversion', '1-Wire on GPIO4, 4.7 kΩ pull-up to 3V3', 'Disconnected reads −127 °C; power-on 85 °C'], // prettier-ignore
  breadboard: ['830 points', 'Left rail + = 3V3, − = GND (every GND); right rails unused', '5 V node on row 25: VIN in A25, ACS712 VCC in B25, relay VCC in C25'], // prettier-ignore
  esp32: ['ESP32-WROOM-32, 30-pin DevKit V1, USB-C from the laptop', 'Off the breadboard: jumper wires to its pins', 'GPIO26 relay IN2, GPIO34 ADC (ACS712), GPIO4 DS18B20, GPIO21/22 I²C'], // prettier-ignore
  r_pu_ds1: ['10 kΩ pull-up, A18 to the 3V3 rail (DS18B20 DATA row)', 'In parallel with r_pu_ds2 through the C18–C19 jumper: 5 kΩ'], // prettier-ignore
  r_pu_ds2: ['10 kΩ pull-up, A19 to the 3V3 rail', 'In parallel with r_pu_ds1 through the C18–C19 jumper: 5 kΩ'],
  r_div_top: ['10 kΩ, B30–B35: top of the ACS712 → GPIO34 divider (×1/2: 2.5 V at 0 A reads 1.25 V)'],
  r_div_bot: ['10 kΩ, C35 to the GND rail: bottom of the divider; GPIO34 from D35'],
  acs712: ['5 A variant, 0.185 V/A, 2.5 V at 0 A, 5 V supply', 'Switched 12 V: IP+ (top screw) ← relay NO2, IP− (bottom screw) → fan red'], // prettier-ignore
  relay: ['2 channels, JQC-3FF-S-Z 5 VDC coils, IN LOW = coil on', 'JD-VCC jumper fitted: the whole module on 5 V', 'Only CH2 used: jack +12 V → COM2, NO2 → ACS712 → fan red (fail-safe); IN2 ← GPIO26, IN1 and NC2 free'], // prettier-ignore
  dcjack: ['5.5 × 2.1 mm female jack with screw terminals'],
  adapter: ['JSY-1220, 12 V 1 A'],
  laptop: ['Runs the RCF and the dashboard; Wi-Fi to the ESP32'],
};

const f = (x: number, digits: number) => x.toFixed(digits);
const level = (high: boolean) => (high ? 'HIGH' : 'LOW');

/** The fan speed and where it comes from: the bench has no speed sensor (D-078), so it is never a measurement. */
function speedLine(s: Snapshot): string {
  const rpm = Math.round(s.rpm);
  return s.unknown ? `speed ≈ ${rpm} rpm (estimated from relay CH2)` : `speed ${rpm} rpm (simulated, not measured on the bench)`; // prettier-ignore
}

/** Live pin lines for one component (units in the text); in Live mode a field the board doesn't send reads "—". */
function pins(id: ComponentId, s: Snapshot, model: { status: ModelStatus; score: number | null } | null): string[] {
  const known = (k: keyof Snapshot) => !s.unknown?.includes(k);
  const n = (k: keyof Snapshot, x: number, digits: number) => (known(k) ? f(x, digits) : '—');
  const lv = (k: keyof Snapshot, high: boolean) => (known(k) ? level(high) : '—');
  const counts = known('adcCounts') ? String(Math.round(s.adcCounts)) : '—';
  const [ax, ay, az] = s.accel_g;
  switch (id) {
    case 'fan':
      return [`red +${n('fanV_V', s.fanV_V, 2)} V, ${n('current_A', s.current_A, 3)} A`, speedLine(s), `motor ${n('tMotor_C', s.tMotor_C, 2)} °C`]; // prettier-ignore
    case 'mpu6050':
      return [`SDA/SCL → GPIO21/22: x=${n('accel_g', ax, 3)} y=${n('accel_g', ay, 3)} z=${n('accel_g', az, 3)} g`];
    case 'ds18b20':
      return [`DATA → GPIO4 ${n('dsReading_C', s.dsReading_C, 4)} °C`, `probe tip ${n('tProbe_C', s.tProbe_C, 2)} °C`];
    case 'acs712':
    case 'r_div_top':
    case 'r_div_bot':
      return [`ACS712 OUT ${n('acsOut_V', s.acsOut_V, 3)} V → GPIO34 ${counts} counts`, `divider mid ${n('adcPin_V', s.adcPin_V, 3)} V`]; // prettier-ignore
    case 'relay':
      return [`IN2 ← GPIO26 ${lv('gpio26', s.gpio26 === 1)} (coil ${s.coilOn ? 'on' : 'off'})`, `COM2 → NO2 ${s.contact === 'NO' ? 'closed' : 'open'}`]; // prettier-ignore
    case 'esp32':
      return [`state ${s.state}`, `GPIO26 ${lv('gpio26', s.gpio26 === 1)}`, `GPIO34 ${counts} counts`, `GPIO4 ${n('dsReading_C', s.dsReading_C, 4)} °C`]; // prettier-ignore
    case 'r_pu_ds1':
    case 'r_pu_ds2':
      return [`DATA ${n('dsReading_C', s.dsReading_C, 4)} °C`];
    case 'dcjack':
    case 'adapter':
      return [`+12 V supply, sag fault ${n('faults', s.faults.supplySag_V, 1)} V`, `fan side ${n('fanV_V', s.fanV_V, 2)} V`]; // prettier-ignore
    case 'breadboard':
      return ['3V3 rail and 5 V node (row 25) from the ESP32'];
    case 'laptop':
      return [model ? `RCF ${model.status}, score ${model.score === null ? '—' : f(model.score, 2)}` : 'RCF —'];
  }
}

/** Wires touching the component: its own anchors, its two breadboard nodes (resistors) or `bb.*` (breadboard). */
/** The wires of a component; a resistor's are the wires on the breadboard strips (or rails) its two leads sit in. */
function wiresOf(id: ComponentId): Wire[] {
  const r = RESISTOR_LINKS.find((x) => x.id === id);
  const nodes = r ? [bbNodeOf(r.a), bbNodeOf(r.b)] : [];
  const touches = (anchor: string) =>
    r ? nodes.includes(bbNodeOf(anchor)) : id === 'breadboard' ? anchor.startsWith('bb.') : anchor.startsWith(`${id}.`);
  return WIRES.filter((w) => touches(w.from) || touches(w.to));
}

/** Everything M9 shows for component `id` at snapshot `s`. */
export function inspectorFor(
  id: ComponentId,
  s: Snapshot,
  model: { status: ModelStatus; score: number | null } | null,
): InspectorInfo {
  // prettier-ignore
  return {
    name: componentById(id).part,
    photo: PHOTOS[id] ?? null,
    specs: SPECS[id],
    pins: pins(id, s, model).map((text) => ({ text })),
    wires: wiresOf(id),
  };
}
