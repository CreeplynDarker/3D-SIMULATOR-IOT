// M9 inspector content (spec §8.2): name, photo crop, key specs (§1.2, §1.3), pins with live values from the
// snapshot, and the component's wires (§13.3). It formats snapshot values; it computes nothing.
import { type ComponentId, componentById } from '../shared/components.ts';
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
  fan: 'textures/fan-hub.jpg',
  esp32: 'textures/esp32-pcb.jpg',
  acs712: 'textures/acs712-pcb.jpg',
  relay: 'textures/relay-pcb.jpg',
  adapter: 'textures/adapter-label.jpg',
};

const SPECS: Record<ComponentId, string[]> = {
  fan: ['12 VDC (4.0–13.8 V), 3,800 rpm, 0.18 A typical', '70 × 70 × 15 mm, 47 g, 7 blades', 'Wires: red +12 V (NO2), black GND, blue tach → GPIO27'], // prettier-ignore
  mpu6050: ['±2 g, 16,384 LSB/g, DLPF 184 Hz', 'I²C 0x68: SDA GPIO21, SCL GPIO22, 3V3'],
  ds18b20: ['12-bit, 0.0625 °C, 750 ms conversion', '1-Wire on GPIO4, 4.7 kΩ pull-up to 3V3', 'Disconnected reads −127 °C; power-on 85 °C'], // prettier-ignore
  breadboard: ['830 points', 'Left rail + = 3V3, right rail + = 5 V, both − = GND'],
  esp32: ['ESP32-WROOM-32, 30-pin DevKit V1, USB-C from the laptop', 'GPIO26 relay IN2, GPIO34 ADC (ACS712), GPIO27 tach, GPIO4 DS18B20, GPIO21/22 I²C'], // prettier-ignore
  r_pu_ds: ['4.7 kΩ pull-up, DS18B20 DATA to 3V3'],
  r_pu_tach: ['10 kΩ pull-up, tach (open collector) to 3V3'],
  r_div_top: ['10 kΩ, top of the ACS712 → GPIO34 divider (×2/3)'],
  r_div_bot: ['20 kΩ, bottom of the ACS712 → GPIO34 divider'],
  acs712: ['5 A variant, 0.185 V/A, 2.5 V at 0 A, 5 V supply', 'IP+ from the jack +12 V, IP− to relay COM2'],
  relay: ['2 channels, JQC-3FF-S-Z 5 VDC coils, IN LOW = coil on', 'Only CH2 used: +12 V → COM2, NO2 → fan red (fail-safe)'], // prettier-ignore
  dcjack: ['5.5 × 2.1 mm female jack with screw terminals'],
  adapter: ['JSY-1220, 12 V 1 A'],
  laptop: ['Runs the RCF and the dashboard; Wi-Fi to the ESP32'],
};

const f = (x: number, digits: number) => x.toFixed(digits);
const level = (high: boolean) => (high ? 'HIGH' : 'LOW');

/** Live pin lines for one component (units in the text). */
function pins(id: ComponentId, s: Snapshot, model: { status: ModelStatus; score: number | null } | null): string[] {
  const [ax, ay, az] = s.accel_g;
  switch (id) {
    case 'fan':
      return [`red +${f(s.fanV_V, 2)} V, ${f(s.current_A, 3)} A`, `blue tach ${level(s.tachHigh)} → GPIO27, ${Math.round(s.rpm)} rpm`, `motor ${f(s.tMotor_C, 2)} °C`]; // prettier-ignore
    case 'mpu6050':
      return [`SDA/SCL → GPIO21/22: x=${f(ax, 3)} y=${f(ay, 3)} z=${f(az, 3)} g`];
    case 'ds18b20':
      return [`DATA → GPIO4 ${f(s.dsReading_C, 4)} °C`, `probe tip ${f(s.tProbe_C, 2)} °C`];
    case 'acs712':
    case 'r_div_top':
    case 'r_div_bot':
      return [`ACS712 OUT ${f(s.acsOut_V, 3)} V → GPIO34 ${Math.round(s.adcCounts)} counts`, `divider mid ${f(s.adcPin_V, 3)} V`]; // prettier-ignore
    case 'relay':
      return [`IN2 ← GPIO26 ${level(s.gpio26 === 1)} (coil ${s.coilOn ? 'on' : 'off'})`, `COM2 → NO2 ${s.contact === 'NO' ? 'closed' : 'open'}`]; // prettier-ignore
    case 'esp32':
      return [`state ${s.state}`, `GPIO26 ${level(s.gpio26 === 1)}`, `GPIO34 ${Math.round(s.adcCounts)} counts`, `GPIO4 ${f(s.dsReading_C, 4)} °C`]; // prettier-ignore
    case 'r_pu_tach':
      return [`tach line ${level(s.tachHigh)}`];
    case 'r_pu_ds':
      return [`DATA ${f(s.dsReading_C, 4)} °C`];
    case 'dcjack':
    case 'adapter':
      return [`+12 V supply, sag fault ${f(s.faults.supplySag_V, 1)} V`, `fan side ${f(s.fanV_V, 2)} V`];
    case 'breadboard':
      return ['3V3 and 5 V rails from the ESP32'];
    case 'laptop':
      return [model ? `RCF ${model.status}, score ${model.score === null ? '—' : f(model.score, 2)}` : 'RCF —'];
  }
}

/** Wires touching the component: its own anchors, its two breadboard nodes (resistors) or `bb.*` (breadboard). */
function wiresOf(id: ComponentId): Wire[] {
  const r = RESISTOR_LINKS.find((x) => x.id === id);
  const touches = (anchor: string) =>
    r ? anchor === r.a || anchor === r.b : id === 'breadboard' ? anchor.startsWith('bb.') : anchor.startsWith(`${id}.`);
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
