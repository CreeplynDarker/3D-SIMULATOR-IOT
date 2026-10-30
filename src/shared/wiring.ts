// Bench wiring from spec §13.3 as data.

export type Net = 'V12' | 'V12_SW' | 'GND' | 'V5' | 'V3V3' | 'SDA' | 'SCL' | 'ONEWIRE' | 'ANALOG' | 'TACH' | 'RELAY_IN';

/** Wire colour key (§13.3). */
export const WIRE_COLORS = {
  red: '#d32f2f',
  black: '#212121',
  orange: '#f57c00',
  pink: '#ec407a',
  blue: '#1e88e5',
  lightBlue: '#4fc3f7',
  yellow: '#fdd835',
  green: '#43a047',
  violet: '#8e24aa',
  white: '#eeeeee',
  grey: '#9e9e9e',
} as const;
export type WireColor = keyof typeof WIRE_COLORS;

export interface Wire {
  id: string;
  /** Anchor id `<component>.<pin>`; `bb.*` are breadboard anchors. */
  from: string;
  to: string;
  net: Net;
  color: WireColor;
}

const w = (id: string, from: string, to: string, net: Net, color: WireColor): Wire => ({ id, from, to, net, color });

export const WIRES: readonly Wire[] = [
  w('W01', 'adapter.plug', 'dcjack.barrel', 'V12', 'grey'),
  w('W02', 'dcjack.plus', 'acs712.ipPlus', 'V12', 'red'),
  w('W03', 'acs712.ipMinus', 'relay.com2', 'V12', 'red'),
  w('W04', 'relay.no2', 'fan.red', 'V12_SW', 'red'),
  w('W05', 'fan.black', 'dcjack.minus', 'GND', 'black'),
  w('W06', 'dcjack.minus', 'bb.railR.n', 'GND', 'black'),
  w('W07', 'esp32.VIN', 'bb.railR.p', 'V5', 'orange'),
  w('W08', 'esp32.3V3', 'bb.railL.p', 'V3V3', 'pink'),
  w('W09', 'esp32.GND', 'bb.railL.n', 'GND', 'black'),
  w('W10', 'bb.railL.n', 'bb.railR.n', 'GND', 'black'),
  w('W11', 'bb.railR.p', 'acs712.vcc', 'V5', 'orange'),
  w('W12', 'bb.railR.n', 'acs712.gnd', 'GND', 'black'),
  w('W13', 'bb.railR.p', 'relay.jdvcc', 'V5', 'orange'),
  w('W14', 'bb.railR.n', 'relay.gnd_a', 'GND', 'black'),
  w('W15', 'bb.railL.p', 'relay.vcc', 'V3V3', 'pink'),
  w('W16', 'bb.railL.n', 'relay.gnd', 'GND', 'black'),
  w('W17', 'bb.railL.p', 'mpu6050.vcc', 'V3V3', 'pink'),
  w('W18', 'bb.railL.n', 'mpu6050.gnd', 'GND', 'black'),
  w('W19', 'mpu6050.sda', 'esp32.D21', 'SDA', 'blue'),
  w('W20', 'mpu6050.scl', 'esp32.D22', 'SCL', 'lightBlue'),
  w('W21', 'ds18b20.red', 'bb.railL.p', 'V3V3', 'pink'),
  w('W22', 'ds18b20.black', 'bb.railL.n', 'GND', 'black'),
  w('W23', 'ds18b20.yellow', 'bb.node.dq', 'ONEWIRE', 'yellow'),
  w('W24', 'bb.node.dq', 'esp32.D4', 'ONEWIRE', 'yellow'),
  w('W25', 'acs712.out', 'bb.node.divTop', 'ANALOG', 'green'),
  w('W26', 'bb.node.divMid', 'esp32.D34', 'ANALOG', 'green'),
  w('W27', 'fan.blue', 'bb.node.tach', 'TACH', 'violet'),
  w('W28', 'bb.node.tach', 'esp32.D27', 'TACH', 'violet'),
  w('W29', 'esp32.D26', 'relay.in2', 'RELAY_IN', 'white'),
];

/** Resistors placed in breadboard holes (not wires), between two anchors (§13.3). */
export const RESISTOR_LINKS = [
  { id: 'r_pu_ds', a: 'bb.node.dq', b: 'bb.railL.p' },
  { id: 'r_pu_tach', a: 'bb.node.tach', b: 'bb.railL.p' },
  { id: 'r_div_top', a: 'bb.node.divTop', b: 'bb.node.divMid' },
  { id: 'r_div_bot', a: 'bb.node.divMid', b: 'bb.railL.n' },
] as const;

/** USB cable from the ESP32 to the laptop: not in the wire list, always energised. */
export const USB_CABLE = { from: 'esp32.usb', to: 'laptop.usb', color: 'grey' } as const;

/** Wi-Fi arc between the ESP32 antenna and the laptop screen. */
export const WIFI_LINK = { from: 'esp32.antenna', to: 'laptop.screenTop' } as const;
