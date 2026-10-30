/** Standard gravity in m/s² per g (CGPM 1901); the MPU6050 reports acceleration in g. */
export const G0_mps2 = 9.80665;

const RADPS_PER_RPM = (2 * Math.PI) / 60;

/** Converts a shaft speed from rev/min to rad/s. */
export function rpmToRadps(rpm: number): number {
  return rpm * RADPS_PER_RPM;
}

/** Converts a shaft speed from rad/s to rev/min. */
export function radpsToRpm(omega_radps: number): number {
  return omega_radps / RADPS_PER_RPM;
}

/** Converts an acceleration from g to m/s². */
export function gToMps2(a_g: number): number {
  return a_g * G0_mps2;
}

/** Converts an acceleration from m/s² to g. */
export function mps2ToG(a_mps2: number): number {
  return a_mps2 / G0_mps2;
}
