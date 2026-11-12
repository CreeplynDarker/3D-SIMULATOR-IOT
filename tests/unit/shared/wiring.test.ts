import { describe, expect, it } from 'vitest';
import { RESISTOR_LINKS, USB_CABLE, WIFI_LINK, WIRE_COLORS, WIRES } from '../../../src/shared/wiring.ts';

// §13.3, row by row (the team's wiring document, D-078 to D-082): ID, from, to, net, colour.
const SPEC = [
  ['W01', 'adapter.plug', 'dcjack.barrel', 'V12', '#9e9e9e'],
  ['W02', 'dcjack.plus', 'relay.com2', 'V12', '#d32f2f'],
  ['W03', 'relay.no2', 'acs712.ipPlus', 'V12_SW', '#d32f2f'],
  ['W04', 'acs712.ipMinus', 'fan.red', 'V12_SW', '#d32f2f'],
  ['W05', 'fan.black', 'dcjack.minus', 'GND12', '#212121'],
  ['W06', 'esp32.VIN', 'bb.A25', 'V5', '#f57c00'],
  ['W07', 'acs712.vcc', 'bb.B25', 'V5', '#f57c00'],
  ['W08', 'relay.vcc', 'bb.C25', 'V5', '#f57c00'],
  ['W09', 'esp32.3V3', 'bb.railL.p', 'V3V3', '#ec407a'],
  ['W10', 'esp32.GND', 'bb.railL.n', 'GND', '#212121'],
  ['W11', 'acs712.gnd', 'bb.railL.n', 'GND', '#212121'],
  ['W12', 'relay.gnd', 'bb.railL.n', 'GND', '#212121'],
  ['W13', 'esp32.D26', 'relay.in2', 'RELAY_IN', '#eeeeee'],
  ['W14', 'acs712.out', 'bb.A30', 'ANALOG', '#43a047'],
  ['W15', 'bb.D35', 'esp32.D34', 'ANALOG', '#43a047'],
  ['W16', 'ds18b20.red', 'bb.railL.p', 'V3V3', '#ec407a'],
  ['W17', 'ds18b20.black', 'bb.railL.n', 'GND', '#212121'],
  ['W18', 'ds18b20.yellow', 'bb.D18', 'ONEWIRE', '#fdd835'],
  ['W19', 'bb.B18', 'esp32.D4', 'ONEWIRE', '#fdd835'],
  ['W20', 'bb.C18', 'bb.C19', 'ONEWIRE', '#fdd835'],
  ['W21', 'mpu6050.vcc', 'bb.railL.p', 'V3V3', '#ec407a'],
  ['W22', 'mpu6050.gnd', 'bb.railL.n', 'GND', '#212121'],
  ['W23', 'mpu6050.sda', 'bb.A45', 'SDA', '#1e88e5'],
  ['W24', 'bb.B45', 'esp32.D21', 'SDA', '#1e88e5'],
  ['W25', 'mpu6050.scl', 'bb.A46', 'SCL', '#4fc3f7'],
  ['W26', 'bb.B46', 'esp32.D22', 'SCL', '#4fc3f7'],
] as const;

describe('wiring (§13.3)', () => {
  it('lists exactly W01–W26 of the wiring document with their endpoints, net and colour', () => {
    expect(WIRES.map((w) => [w.id, w.from, w.to, w.net, WIRE_COLORS[w.color]])).toEqual(SPEC);
  });

  it('follows the document: no right-rail 5 V, no GND rail bridge, every GND on the left blue rail', () => {
    const anchors = WIRES.flatMap((w) => [w.from, w.to]);
    expect(anchors.filter((a) => a.startsWith('bb.railR'))).toEqual([]);
    expect(WIRES.filter((w) => w.net === 'GND').every((w) => w.to === 'bb.railL.n')).toBe(true);
    expect(WIRES.filter((w) => w.net === 'V5').map((w) => w.to)).toEqual(['bb.A25', 'bb.B25', 'bb.C25']);
    expect(anchors).not.toContain('fan.blue'); // tach left free
    for (const free of [
      'relay.in1',
      'relay.nc2',
      'relay.jdvcc',
      'relay.gnd_a',
      'mpu6050.xda',
      'mpu6050.xcl',
      'mpu6050.ad0',
      'mpu6050.int',
    ])
      // prettier-ignore
      expect(anchors, free).not.toContain(free);
    expect(WIRES.filter((w) => w.net === 'GND12').map((w) => [w.from, w.to])).toEqual([['fan.black', 'dcjack.minus']]); // no common ground
  });

  it('places the four 10 kΩ resistors in the holes the document names', () => {
    expect(RESISTOR_LINKS.map((r) => [r.id, r.a, r.b])).toEqual([
      ['r_pu_ds1', 'bb.A18', 'bb.railL.p'],
      ['r_pu_ds2', 'bb.A19', 'bb.railL.p'],
      ['r_div_top', 'bb.B30', 'bb.B35'],
      ['r_div_bot', 'bb.C35', 'bb.railL.n'],
    ]);
  });

  it('adds the grey USB cable and the Wi-Fi arc', () => {
    expect(USB_CABLE).toEqual({ from: 'esp32.usb', to: 'laptop.usb', color: 'grey' });
    expect(WIFI_LINK).toEqual({ from: 'esp32.antenna', to: 'laptop.screenTop' });
  });
});
