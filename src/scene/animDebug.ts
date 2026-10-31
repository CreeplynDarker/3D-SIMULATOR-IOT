// What the animated parts drew last frame, for the e2e tests (`window.__scene.anim()`, only with `?debug=1`).
// Components overwrite plain fields in useFrame; nothing reads it back.

export const animDebug = {
  fan: { bladeAngle_rad: 0, bladeOpacity: 1, discOpacity: 0, jitterAmp_mm: 0, jitter_mm: [0, 0] as [number, number], airflowVisible: false }, // prettier-ignore
};

export type AnimDebug = typeof animDebug;
