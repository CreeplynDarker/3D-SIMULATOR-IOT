import { describe, expect, it } from 'vitest';
import { componentById } from '../../../src/shared/components.ts';
import { RESISTOR_LINKS, USB_CABLE, WIFI_LINK, WIRES } from '../../../src/shared/wiring.ts';
import { anchor, hasAnchor, worldAnchor_m } from '../../../src/scene/anchors.ts';

const referenced = [
  ...WIRES.flatMap((w) => [w.from, w.to]),
  ...RESISTOR_LINKS.flatMap((r) => [r.a, r.b]),
  USB_CABLE.from,
  USB_CABLE.to,
  WIFI_LINK.from,
  WIFI_LINK.to,
];

describe('anchors', () => {
  it('every anchor referenced in shared/wiring.ts exists', () => {
    expect(referenced.filter((id) => !hasAnchor(id))).toEqual([]);
  });

  it('rejects unknown anchors', () => {
    expect(hasAnchor('esp32.D99')).toBe(false);
    expect(hasAnchor('nothing.here')).toBe(false);
    expect(() => anchor('esp32.D99')).toThrow();
  });

  it('places ESP32 header pins per §1.4 (USB-C toward −x, left column toward −z)', () => {
    const en = worldAnchor_m('esp32.EN');
    const vin = worldAnchor_m('esp32.VIN');
    const d23 = worldAnchor_m('esp32.D23');
    const v33 = worldAnchor_m('esp32.3V3');
    const usb = worldAnchor_m('esp32.usb');
    expect(en[0]).toBeGreaterThan(vin[0]); // EN at the antenna end, VIN at the USB end
    expect(usb[0]).toBeLessThan(vin[0]);
    expect(en[2]).toBeLessThan(d23[2]); // left column on −z
    expect(vin[2]).toBeCloseTo(en[2], 9);
    expect(v33[2]).toBeCloseTo(d23[2], 9);
    expect(en[0] - worldAnchor_m('esp32.VP')[0]).toBeCloseTo(0.00254, 9);
  });

  it('puts the relay terminals on −z and the input headers on +z', () => {
    const relayZ = componentById('relay').position_m[2];
    expect(worldAnchor_m('relay.com2')[2]).toBeLessThan(relayZ);
    expect(worldAnchor_m('relay.in2')[2]).toBeGreaterThan(relayZ);
    // OPEN-5 (closed): NC – COM – NO from left to right as on the silkscreen, terminals facing away (left = −x).
    const order = ['relay.nc1', 'relay.com1', 'relay.no1', 'relay.nc2', 'relay.com2', 'relay.no2'];
    const xs = order.map((id) => worldAnchor_m(id)[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('puts the ACS712 terminals toward −x and its header toward +x', () => {
    const x = componentById('acs712').position_m[0];
    expect(worldAnchor_m('acs712.ipPlus')[0]).toBeLessThan(x);
    expect(worldAnchor_m('acs712.out')[0]).toBeGreaterThan(x);
  });

  it('rotates laptop anchors with the laptop', () => {
    const usb = worldAnchor_m('laptop.usb');
    const laptop = componentById('laptop').position_m;
    // local −x side, turned −20° about y: lands at −x and +z of the laptop centre
    expect(usb[0]).toBeLessThan(laptop[0]);
    expect(Math.hypot(usb[0] - laptop[0], usb[2] - laptop[2])).toBeGreaterThan(0.15);
  });

  it('gives every anchor a unit exit direction', () => {
    for (const id of referenced) {
      const out = anchor(id).out;
      expect(Math.hypot(...out)).toBeCloseTo(1, 6);
    }
  });
});
