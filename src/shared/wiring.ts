// Bench wiring from spec §13.3 as data.

/**
 * Electrical nets. `GND12` is the 12 V supply's return (jack −, fan black): the bench has no common ground, so it never
 * meets the logic `GND` of the ESP32 side (D-081).
 */
export type Net =
  'V12' | 'V12_SW' | 'GND12' | 'GND' | 'V5' | 'V3V3' | 'SDA' | 'SCL' | 'ONEWIRE' | 'ANALOG' | 'RELAY_IN';

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

// The team's wiring document (D-080 to D-082). Breadboard holes are named as in it: `bb.A25` is column A, row 25.
export const WIRES: readonly Wire[] = [
  // 12 V: jack + → relay COM2 → NO2 → ACS712 IP+ (top screw) → IP− (bottom screw) → fan red; fan black → jack −
  w('W01', 'adapter.plug', 'dcjack.barrel', 'V12', 'grey'),
  w('W02', 'dcjack.plus', 'relay.com2', 'V12', 'red'),
  w('W03', 'relay.no2', 'acs712.ipPlus', 'V12_SW', 'red'),
  w('W04', 'acs712.ipMinus', 'fan.red', 'V12_SW', 'red'),
  w('W05', 'fan.black', 'dcjack.minus', 'GND12', 'black'),
  // 5 V node on row 25: ESP32 VIN in A25, ACS712 VCC in B25, relay VCC in C25
  w('W06', 'esp32.VIN', 'bb.A25', 'V5', 'orange'),
  w('W07', 'acs712.vcc', 'bb.B25', 'V5', 'orange'),
  w('W08', 'relay.vcc', 'bb.C25', 'V5', 'orange'),
  // 3V3 on the left red rail; every GND on the left blue rail
  w('W09', 'esp32.3V3', 'bb.railL.p', 'V3V3', 'pink'),
  w('W10', 'esp32.GND', 'bb.railL.n', 'GND', 'black'),
  w('W11', 'acs712.gnd', 'bb.railL.n', 'GND', 'black'),
  w('W12', 'relay.gnd', 'bb.railL.n', 'GND', 'black'),
  // relay control: IN2 straight to GPIO26 (IN1 and NC2 free)
  w('W13', 'esp32.D26', 'relay.in2', 'RELAY_IN', 'white'),
  // ACS712 OUT into row 30; 10 kΩ B30–B35 and 10 kΩ C35–GND rail; GPIO34 from D35
  w('W14', 'acs712.out', 'bb.A30', 'ANALOG', 'green'),
  w('W15', 'bb.D35', 'esp32.D34', 'ANALOG', 'green'),
  // DS18B20: DATA into D18, B18 to GPIO4; pull-ups A18 and A19 to 3V3, joined by the C18–C19 jumper
  w('W16', 'ds18b20.red', 'bb.railL.p', 'V3V3', 'pink'),
  w('W17', 'ds18b20.black', 'bb.railL.n', 'GND', 'black'),
  w('W18', 'ds18b20.yellow', 'bb.D18', 'ONEWIRE', 'yellow'),
  w('W19', 'bb.B18', 'esp32.D4', 'ONEWIRE', 'yellow'),
  w('W20', 'bb.C18', 'bb.C19', 'ONEWIRE', 'yellow'),
  // MPU6050 (GY-521): SDA into A45, B45 to GPIO21; SCL into A46, B46 to GPIO22; XDA, XCL, AD0 and INT free
  w('W21', 'mpu6050.vcc', 'bb.railL.p', 'V3V3', 'pink'),
  w('W22', 'mpu6050.gnd', 'bb.railL.n', 'GND', 'black'),
  w('W23', 'mpu6050.sda', 'bb.A45', 'SDA', 'blue'),
  w('W24', 'bb.B45', 'esp32.D21', 'SDA', 'blue'),
  w('W25', 'mpu6050.scl', 'bb.A46', 'SCL', 'lightBlue'),
  w('W26', 'bb.B46', 'esp32.D22', 'SCL', 'lightBlue'),
  // the fan's blue tach lead is left free: drawn loose, no wire (D-078)
];

/** Resistors placed in breadboard holes (not wires), between two anchors (§13.3, D-082). */
export const RESISTOR_LINKS = [
  { id: 'r_pu_ds1', a: 'bb.A18', b: 'bb.railL.p' },
  { id: 'r_pu_ds2', a: 'bb.A19', b: 'bb.railL.p' },
  { id: 'r_div_top', a: 'bb.B30', b: 'bb.B35' },
  { id: 'r_div_bot', a: 'bb.C35', b: 'bb.railL.n' },
] as const;

/** USB cable from the ESP32 to the laptop: not in the wire list, always energised. */
export const USB_CABLE = { from: 'esp32.usb', to: 'laptop.usb', color: 'grey' } as const;

/** Wi-Fi arc between the ESP32 antenna and the laptop screen. */
export const WIFI_LINK = { from: 'esp32.antenna', to: 'laptop.screenTop' } as const;
