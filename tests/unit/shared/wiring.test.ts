import { describe, expect, it } from 'vitest';
import { RESISTOR_LINKS, USB_CABLE, WIFI_LINK, WIRE_COLORS, WIRES } from '../../../src/shared/wiring.ts';

// §13.3, row by row: ID, from, to, net, colour.
const SPEC = [
  ['W01', 'adapter.plug', 'dcjack.barrel', 'V12', '#9e9e9e'],
  ['W02', 'dcjack.plus', 'acs712.ipPlus', 'V12', '#d32f2f'],
  ['W03', 'acs712.ipMinus', 'relay.com2', 'V12', '#d32f2f'],
  ['W04', 'relay.no2', 'fan.red', 'V12_SW', '#d32f2f'],
  ['W05', 'fan.black', 'dcjack.minus', 'GND', '#212121'],
  ['W06', 'dcjack.minus', 'bb.railR.n', 'GND', '#212121'],
  ['W07', 'esp32.VIN', 'bb.railR.p', 'V5', '#f57c00'],
  ['W08', 'esp32.3V3', 'bb.railL.p', 'V3V3', '#ec407a'],
  ['W09', 'esp32.GND', 'bb.railL.n', 'GND', '#212121'],
  ['W10', 'bb.railL.n', 'bb.railR.n', 'GND', '#212121'],
  ['W11', 'bb.railR.p', 'acs712.vcc', 'V5', '#f57c00'],
  ['W12', 'bb.railR.n', 'acs712.gnd', 'GND', '#212121'],
  ['W13', 'bb.railR.p', 'relay.jdvcc', 'V5', '#f57c00'],
  ['W14', 'bb.railR.n', 'relay.gnd_a', 'GND', '#212121'],
  ['W15', 'bb.railL.p', 'relay.vcc', 'V3V3', '#ec407a'],
  ['W16', 'bb.railL.n', 'relay.gnd', 'GND', '#212121'],
  ['W17', 'bb.railL.p', 'mpu6050.vcc', 'V3V3', '#ec407a'],
  ['W18', 'bb.railL.n', 'mpu6050.gnd', 'GND', '#212121'],
  ['W19', 'mpu6050.sda', 'esp32.D21', 'SDA', '#1e88e5'],
  ['W20', 'mpu6050.scl', 'esp32.D22', 'SCL', '#4fc3f7'],
  ['W21', 'ds18b20.red', 'bb.railL.p', 'V3V3', '#ec407a'],
  ['W22', 'ds18b20.black', 'bb.railL.n', 'GND', '#212121'],
  ['W23', 'ds18b20.yellow', 'bb.node.dq', 'ONEWIRE', '#fdd835'],
  ['W24', 'bb.node.dq', 'esp32.D4', 'ONEWIRE', '#fdd835'],
  ['W25', 'acs712.out', 'bb.node.divTop', 'ANALOG', '#43a047'],
  ['W26', 'bb.node.divMid', 'esp32.D34', 'ANALOG', '#43a047'],
  ['W27', 'fan.blue', 'bb.node.tach', 'TACH', '#8e24aa'],
  ['W28', 'bb.node.tach', 'esp32.D27', 'TACH', '#8e24aa'],
  ['W29', 'esp32.D26', 'relay.in2', 'RELAY_IN', '#eeeeee'],
] as const;

describe('wiring (§13.3)', () => {
  it('lists exactly W01–W29 with their endpoints, net and colour', () => {
    expect(WIRES.map((w) => [w.id, w.from, w.to, w.net, WIRE_COLORS[w.color]])).toEqual(SPEC);
  });

  it('places the four resistors between the §13.3 anchors', () => {
    expect(RESISTOR_LINKS.map((r) => [r.id, r.a, r.b])).toEqual([
      ['r_pu_ds', 'bb.node.dq', 'bb.railL.p'],
      ['r_pu_tach', 'bb.node.tach', 'bb.railL.p'],
      ['r_div_top', 'bb.node.divTop', 'bb.node.divMid'],
      ['r_div_bot', 'bb.node.divMid', 'bb.railL.n'],
    ]);
  });

  it('adds the grey USB cable and the Wi-Fi arc', () => {
    expect(USB_CABLE).toEqual({ from: 'esp32.usb', to: 'laptop.usb', color: 'grey' });
    expect(WIFI_LINK).toEqual({ from: 'esp32.antenna', to: 'laptop.screenTop' });
  });
});
