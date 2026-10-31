# PLAN.md — 3D Simulator: agent-executable specification

Version 1 · 2026-10-29 · Grupo 7, UTEC CS5055 (IoT) 2026-2

This file is the single source of truth for building the simulator. Section numbers are stable; tasks in §11 cite
them. Read `AGENTS.md` first for rules and the work loop.

---

## 0. How to use this file

- §1–§2 state the facts and the assumptions. §3–§5 fix the stack, the layout and every number.
- §6–§10 are the specs you implement. §11 lists the tasks with their files and checks. §12 defines the scenarios
  that the checks run. §13 specifies the 3D scene.
- Check tags: `[auto]` = a Vitest test; `[e2e]` = a Playwright test; `[human]` = a person reviews it (list it in
  `docs/PROGRESS.md`).
- Words: **must** = required; **should** = default unless there's a written reason in `docs/DECISIONS.md`.

---

## 1. Context and confirmed facts

### 1.1 Goal

A static web app showing the real bench in 3D, running the full chain at real time or faster:
plant (fan, heat, sensors) → ESP32 firmware mirror (sampling, 1 s features, local limits, state machine, relay) →
"Wi-Fi" → laptop RCF (score, dominant variable, verdict) → back to the firmware → relay CH2 → fan supply.

Demo story the app must support end to end:

1. Start the fan and see a stable baseline.
2. Inject a fault: imbalance, looseness, friction, overheat, supply sag, Wi-Fi loss or sensor disconnect.
3. See the variable that moved away from normal, the RCF score crossing its threshold, and the state going
   NORMAL → WARNING → CRITICAL.
4. Relay CH2 opens, the 12 V wire to the fan goes dark and the fan coasts down.
5. The fan stays off until the operator presses RESET and then START.

### 1.2 Hardware (confirmed by the team)

| Item | Fact |
| --- | --- |
| Fan | Delta AFB0712HB-F00. 70 × 70 × 15 mm, 47 g, 12 VDC, 4.0–13.8 V, 3,800 RPM, 0.18 A typical (0.33 A on label = max), 3 wires: red +12 V, black GND, blue tach. Datasheet: https://www.mouser.com/datasheet/2/632/AFB70x70x15mm-515820.pdf |
| Relay | 2-channel optocoupler module, coils TONGLING JQC-3FF-S-Z **5 VDC**, low-level trigger (IN LOW = coil on). CH1 is dead (marked with an X); **only CH2 is used**. |
| Relay wiring | +12 V → COM2; NO2 → fan red (fail-safe: no coil current = fan off). JD-VCC jumper **removed**: JD-VCC = 5 V (ESP32 VIN), VCC = 3V3. |
| Controller | ESP32 DevKit V1, 30 pins, USB-C, ESP32-WROOM-32, powered by the laptop over USB. |
| Current sensor | ACS712 module (5 A variant assumed, see OPEN-2), 5 V supply, header Vcc/Out/Gnd, 2-screw terminal IP+/IP−. |
| Temperature | DS18B20 waterproof probe, steel tip, wires red (VCC) / yellow (DATA) / black (GND). |
| Vibration | MPU6050 GY-521 module (see OPEN-4). |
| Power | JSY-1220 wall adapter, 12 V 1 A, barrel plug (see OPEN-6). |
| Breadboard | 830-point, two power rails per side. |
| Laptop | Runs RCF and the dashboard; same Wi-Fi network as the ESP32. |

### 1.3 Pin map (ESP32)

| Signal | Pin | Notes |
| --- | --- | --- |
| MPU6050 SDA / SCL | GPIO21 / GPIO22 | I²C, 3V3, address 0x68 (AD0 left unconnected; GY-521 pulls it low) |
| DS18B20 DATA | GPIO4 | 4.7 kΩ pull-up to 3V3 |
| ACS712 OUT via divider | GPIO34 | ADC1_CH6, input-only, 11 dB attenuation; works with Wi-Fi on |
| Fan tach (blue) | GPIO27 | Open collector; 10 kΩ pull-up to 3V3; counted by PCNT on rising edges |
| Relay IN2 | GPIO26 | LOW = coil on = NO2 closed = fan powered; HIGH or floating at boot = fan off |
| Relay IN1 | — | Not connected |

### 1.4 ESP32 DevKit V1 (30-pin) header order

USB-C at the bottom, module antenna at the top, viewed from the component side:

- Left column, top → bottom: `EN, VP(36), VN(39), D34, D35, D32, D33, D25, D26, D27, D14, D12, D13, GND, VIN`
- Right column, top → bottom: `D23, D22, TX0, RX0, D21, D19, D18, D5, TX2, RX2, D4, D2, D15, GND, 3V3`

### 1.5 Module pinouts used by the 3D anchors

| Module | Pins (anchor names) |
| --- | --- |
| Relay | Input header A: `jdvcc, vcc_a, gnd_a` (jumper removed). Input header B: `gnd, in1, in2, vcc`. Terminals: `nc1, com1, no1, nc2, com2, no2`, in that order from left to right with the terminals facing away (CH1 on the left; COM is the middle screw of each block; OPEN-5). |
| ACS712 | `vcc, out, gnd`; terminals `ipPlus, ipMinus` |
| MPU6050 GY-521 | `vcc, gnd, scl, sda, xda, xcl, ad0, int` |
| DS18B20 | `red, yellow, black` (cable ends) |
| Fan | `red, black, blue` (cable ends) |
| DC jack adapter | `plus, minus` (screw terminals) |
| ESP32 | `EN, VP, VN, D34, …, VIN, D23, …, 3V3` per §1.4, plus `usb`, `antenna` |

---

## 2. Open items (proceed with the default; never block on these unless stated)

| ID | Question | Default used | Where it matters |
| --- | --- | --- | --- |
| OPEN-1 | Is RPM a 6th RCF feature? (The report lists 5.) | **Closed 2026-10-30 (team): yes.** `rcf.features` includes `rpm`; it stays switchable in config. | §5.1, §9 |
| OPEN-2 | ACS712 variant (5/20/30 A) | 5 A, 0.185 V/A | §6.5 |
| OPEN-3 | Tach pulses per revolution | 2 | §6.7 |
| OPEN-4 | MPU6050 module on hand and its mounting | GY-521 taped flat on the frame's top edge | §13 |
| OPEN-5 | NO/NC terminal order on each relay block | **Closed 2026-10-30 (team, continuity test): `NC – COM – NO`** from left to right, terminals facing away, as on the board silkscreen. | §1.5, §13 |
| OPEN-6 | How the barrel plug reaches the breadboard | Female 5.5 × 2.1 mm DC jack with screw terminals | §13 |
| OPEN-7 | Blade count | 7 | §6.3 |

When the team answers one, update the default here, then `config.ts`, then log it in `docs/DECISIONS.md`.

---

## 3. Stack (exact versions; all published before 2026-10-15)

| Package | Version | Role |
| --- | --- | --- |
| node / pnpm | 22.x / 10.x | Runtime / package manager |
| typescript | 6.0.3 | Language (7.x is excluded: typescript-eslint 8.71 supports < 6.1) |
| vite | 8.3.4 | Dev server and build |
| @vitejs/plugin-react | 6.1.2 | React plugin |
| react, react-dom | 19.3.1 | UI |
| three | 0.186.1 | 3D engine |
| @types/three | 0.186.0 | Types |
| @react-three/fiber | 9.8.2 | React renderer for three |
| @react-three/drei | 10.7.9 | OrbitControls, Html, ContactShadows, Outlines, Environment |
| @react-three/postprocessing / postprocessing | 3.2.0 / 6.39.5 | Bloom for LEDs, outline |
| zustand | 5.0.15 | Store |
| zod | 4.6.7 | Protocol schemas and types; `z.toJSONSchema` for `gen:schema` |
| uplot | 1.6.32 | Streaming charts |
| tailwindcss / @tailwindcss/vite | 4.3.3 | Styling |
| vitest / @vitest/coverage-v8 | 5.0.4 | Unit and scenario tests |
| @playwright/test | 1.64.1 | End-to-end tests (Chromium) |
| eslint / typescript-eslint | 10.12.0 / 8.71.2 | Lint |
| prettier | 3.9.10 | Format |
| Python (scripts only) | 3.11+, numpy, rrcf 0.4.4 | Reference implementations |

Vite config: `worker: { format: 'es' }`; `base: './'` so the build works from any static path.

---

## 4. Repository layout (create exactly these paths)

```
AGENTS.md
docs/PLAN.md  docs/PROGRESS.md  docs/DECISIONS.md
assets/photos/                 # team photos (inputs for textures; not shipped)
public/textures/  public/models/  public/schema/  public/audio/
scripts/
  export-schema.ts  train-default-model.ts  gen-fixtures.ts
  features_reference.py  rrcf_reference.py
src/
  main.tsx  App.tsx  index.css
  shared/   config.ts  units.ts  rng.ts  protocol.ts  messages.ts  components.ts  wiring.ts  scenarios.ts
  sim/      plant.ts  fan.ts  thermal.ts  vibration.ts  faults.ts  relay.ts  supply.ts
            sensors/  mpu6050.ts  acs712.ts  adc.ts  ds18b20.ts  tach.ts
            worker.ts
  firmware/ firmware.ts  sampler.ts  features.ts  limits.ts  stateMachine.ts  link.ts  logger.ts
            reference-cpp/  main.cpp  features.cpp  state_machine.cpp  relay.cpp
  rcf/      rrcf.ts  normalise.ts  model.ts  worker.ts
  harness/  runScenario.ts  trainDefault.ts
  store/    index.ts  slices/  sim.ts  series.ts  console.ts  model.ts  ui.ts  testlog.ts
  scene/    Bench.tsx  anchors.ts  cameras.ts
            models/  Fan.tsx  Esp32.tsx  Breadboard.tsx  Relay.tsx  Acs712.tsx  Mpu6050.tsx  Ds18b20.tsx
                     DcJack.tsx  Adapter.tsx  Laptop.tsx  Resistor.tsx
            wires/   Wire.tsx  Wires.tsx  WifiArc.tsx
            effects/ BladeBlur.tsx  HeatTint.tsx  Pulses.tsx  Leds.tsx
  ui/       layout/  AppShell.tsx  Dock.tsx
            TopBar.tsx  StatusPanel.tsx  FaultPanel.tsx  OperatorPanel.tsx  Charts.tsx  Console.tsx
            CodePanel.tsx  Inspector.tsx  TestLog.tsx  Scenarios.tsx  Legend.tsx
  bridge/   wsClient.ts                      # P8 only
tests/
  unit/  (mirrors src/)    scenario/  e2e/    fixtures/
bridge-py/                                   # P8 only
```

---

## 5. Configuration

### 5.1 `src/shared/config.ts` (copy verbatim, then only tune §5.2 keys)

```ts
export const CONFIG = {
  seed: 20261029,
  physics: { dt_s: 0.0005 },                          // 2 kHz plant step
  fan: {
    rpmRated: 3800, vRated_V: 12, vStart_V: 4.0, vMax_V: 13.8,
    tauUp_s: 0.8, tauDown_s: 2.5,
    iIdle_A: 0.03, iAero_A: 0.15, iFriction_A: 0.40,  // iIdle + iAero = 0.18 A at rated
    iInrushGain_A: 0.15, iInrushMax_A: 0.33,
    iRipple_A: 0.01, rippleHarmonic: 4,
    frictionSpeedLoss: 0.25, frictionCoastFactor: 0.6,
    blades: 7, tachPulsesPerRev: 2,
    residualUnbalance_gmm: 2.0, unbalanceRadius_mm: 28, mountMass_kg: 0.25,
    bladePass_g: 0.02,
    looseGain: 1.5, looseH2: 0.5, looseH3: 0.25, looseNoise_g: 0.04,
    looseImpulseGain: 2.0, looseImpulseTau_s: 0.002, looseImpulseFreq_Hz: 300,
  },
  thermal: {
    ambient_C: 25, overheatAmbientMax_K: 35, heatFraction: 0.35,
    rTh0_KperW: 18, airflowCooling: 0.5, cTh_JperK: 15, warmStart: true,
  },
  sensors: {
    mpu: { range_g: 2, lsbPerG: 16384, noise_g: 0.007, dlpfCutoff_Hz: 184 },
    acs712: { vZero_V: 2.5, sens_VperA: 0.185, noise_V: 0.005 },
    divider: { rTop_ohm: 10000, rBottom_ohm: 20000 },
    adc: { maxCount: 4095, vMin_V: 0.075, vSpan_V: 3.05, noise_counts: 2, inl_counts: 6 },
    ds18b20: { probeTau_s: 8, resolution_C: 0.0625, conversion_s: 0.75, period_s: 1,
               disconnected_C: -127, powerOn_C: 85 },
  },
  relay: { pullIn_s: 0.010, release_s: 0.005, coil_A: 0.072 },
  supply: { v_V: 12, sagMax_V: 3 },
  link: { latency_s: 0.02, latencyJitter_s: 0.01, lossTimeout_s: 5 },
  firmware: {
    sampleRate_Hz: 1000, window_s: 1, calib_s: 0.5, startGrace_s: 10,
    dtdtSpan_s: 60, dtdtMinSamples: 10, tJumpReject_C: 10,
    iMax_A: 0.30, iMaxStart_A: 0.40, nILimit: 3,
    tMax_C: 60, tWarnMargin_C: 5, iWarnFraction: 0.9,
    stallFraction: 0.5, nStall: 3, sensorFaultTimeout_s: 10,
    nCritical: 5, nClear: 3, clearHysteresis: 0.8, resetMaxRpm: 100,
  },
  rcf: {
    features: ['a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min', 'rpm'] as const,   // OPEN-1
    numTrees: 40, treeSize: 256, nTrain: 120, nHoldout: 60,
    threshold: 0.5,                    // on the normalised score (mean CoDisp / nTrain)
    holdoutMaxRatio: 0.8,              // baseline rejected if holdout max ≥ 0.8 × threshold
    warmDtdtMax_C_per_min: 0.2,
    stdFloor: { a_rms_g: 0.005, cf: 0.05, i_rms_A: 0.002, t_C: 0.1, dtdt_C_per_min: 0.05, rpm: 15 },
  },
  faults: {                            // slider ranges
    imbalance_g: { min: 0, max: 0.5, step: 0.05 },
    looseness: { min: 0, max: 1, step: 0.05 },
    friction: { min: 0, max: 1, step: 0.05 },
    overheat: { min: 0, max: 1, step: 0.05 },
    supplySag_V: { min: 0, max: 3, step: 0.1 },
    packetLoss: { min: 0, max: 1, step: 0.05 },
  },
  ui: {
    speeds: [0.25, 1, 4, 10], chartWindows_s: [30, 120, 600], chartWindowDefault_s: 120,
    consoleMaxLines: 5000, snapshotHz: 60,
    vibVisual_mm_per_g: 0.5, vibVisual_Hz: 6, vibVisualMax_mm: 4, bladeBlurRpm: 600,
  },
} as const;
export type Config = typeof CONFIG;
```

### 5.2 Tunable keys and allowed ranges

Tune only these, only to make a failing acceptance check pass, and log each change in `docs/DECISIONS.md`.

| Key | Range |
| --- | --- |
| `rcf.threshold` | 0.35–0.70 |
| `rcf.numTrees` | 20–100 |
| `rcf.nTrain` / `rcf.nHoldout` | 120–240 / 60–120 |
| `rcf.stdFloor.*` | 0.5×–3× default |
| `firmware.nCritical` / `firmware.nClear` | 3–8 / 2–5 |
| `firmware.clearHysteresis` | 0.6–0.9 |
| `sensors.*.noise_*` | 0.5×–2× default |
| `fan.looseImpulseGain`, `fan.looseNoise_g` | 0.5×–2× default |
| `thermal.cTh_JperK` | 10–30 |

A Python prototype of §6, §7 and §9 with these defaults was run on 2026-10-29 (`scripts/` will hold the
reference versions). Results: healthy 600 s run had 0 alerts with a peak score of 0.37; imbalance 0.3 g tripped
5 s after onset; looseness 0.6 and friction ramp 5–6 s; overheat 9 s; Wi-Fi loss + overheat tripped on T_MAX at
t = 312 s. §12 targets include margin over these.

---

## 6. Plant models (`src/sim/`)

All state advances with a fixed step `dt = physics.dt_s`. Notation: `r = ω / ω_rated` with
`ω_rated = rpmRated · 2π / 60` (≈ 397.9 rad/s). `θ` is the rotor angle (rad, unbounded).

### 6.1 Fan (`fan.ts`)

Supply at the fan: `V = relayNoClosed ? supply.v_V − sag_V : 0`.

Target speed (with friction level `f ∈ [0, 1]`):

```
ω_target = ω_rated · clamp((V − vStart) / (vRated − vStart), 0, (vMax − vStart)/(vRated − vStart)) · (1 − frictionSpeedLoss · f)
```

Dynamics:

```
if V ≥ vStart:  dω/dt = (ω_target − ω) / tauUp
else:           dω/dt = −ω / (tauDown · (1 − frictionCoastFactor · f))
dθ/dt = ω
```

Current (A), zero when `V < vStart`:

```
I_base   = iIdle + iAero · r³ + iFriction · f · r
inrush   = (ω_target > 0) ? iInrushGain · max(0, 1 − ω/ω_target) : 0
I        = inrush > 0 ? min(iInrushMax, I_base + inrush) : I_base
I_inst   = I + iRipple · sin(rippleHarmonic · θ)
```

Expose `rpm = ω · 60 / 2π`, `I_A = I_inst`, `power_W = V · I`.

### 6.2 Thermal (`thermal.ts`)

```
T_amb  = ambient_C + overheat · overheatAmbientMax_K
P_heat = heatFraction · V · I                      (W)
R_th   = rTh0 / (1 + airflowCooling · r)           (K/W)
C_th · dT/dt = P_heat − (T − T_amb) / R_th
```

Warm start (`thermal.warmStart`): `T(0) = ambient_C + heatFraction · vRated · (iIdle + iAero) · rTh0 / (1 + airflowCooling)`
≈ 34.07 °C. Otherwise `T(0) = ambient_C`. The probe starts equal to `T(0)`.

### 6.3 Vibration, true acceleration in g (`vibration.ts`)

MPU axes: x and y lie in the fan plane (y vertical, so +1 g of gravity), z is the fan axis.

```
u      = residualUnbalance_gmm + imbalance_g · unbalanceRadius_mm         (g·mm)
A1     = u · 1e-6 · ω² / (mountMass_kg · 9.80665)                          (g)
L      = looseness;  G = 1 + looseGain · L;  B = bladePass_g · r²
ax = G·A1·cos θ + looseH2·L·A1·cos(2θ+φ2) + looseH3·L·A1·cos(3θ+φ3) + 0.3·B·sin(blades·θ) + imp + n_L
ay = G·A1·sin θ + looseH2·L·A1·sin(2θ+φ2) + looseH3·L·A1·sin(3θ+φ3) + 0.3·B·cos(blades·θ) + imp + n_L + 1
az = 0.2·G·A1·cos(θ + π/4) + B·sin(blades·θ) + n_L
```

- `φ2, φ3` are drawn once per run from the seeded RNG, uniform on [0, 2π).
- `imp` (looseness impact), added to x and y: at each revolution (θ crosses a multiple of 2π) restart
  `t' = 0`; `imp = looseImpulseGain · L · A1 · exp(−t'/looseImpulseTau_s) · sin(2π · looseImpulseFreq_Hz · t')`.
- `n_L ~ N(0, (looseNoise_g · L)²)` per axis per step.
- Healthy rated check: `A1 ≈ 0.129 g`, so the window a_RMS is about 0.12 g.

### 6.4 MPU6050 chain (`sensors/mpu6050.ts`)

Per axis, at every physics step: first-order low-pass (DLPF) `y += α (a − y)`, `α = dt / (1/(2π·dlpfCutoff) + dt)`.
At each firmware sample (1 kHz, every 2nd step): `s = y + N(0, noise_g²)`, quantise `round(s · lsbPerG) / lsbPerG`,
clip to `±range_g`.

### 6.5 Current chain (`sensors/acs712.ts`, `sensors/adc.ts`)

```
V_out  = vZero + sens · I_inst + N(0, noise_V²)          (ACS712, volts)
V_pin  = V_out · rBottom / (rTop + rBottom)               (= × 0.6667)
counts = clamp(round( maxCount · (V_pin − vMin)/vSpan + inl · sin(π · V_pin / 3.1) + N(0, noise_counts²) ), 0, maxCount)
```

Expose `V_out`, `V_pin`, `counts` in the snapshot for the Inspector.

### 6.6 DS18B20 (`sensors/ds18b20.ts`)

- Probe lag: `dT_p/dt = (T − T_p) / probeTau`.
- Every `period_s`, a conversion starts; its result becomes readable `conversion_s` later and equals
  `round(T_p(at completion) / resolution) · resolution`.
- The first conversion after sim start returns `powerOn_C` (85.0), as real parts do.
- While the disconnect fault is on, every reading is `disconnected_C` (−127).

### 6.7 Tach (`sensors/tach.ts`)

`pulsesTotal = floor(θ / 2π · tachPulsesPerRev)`. A rising edge occurs whenever `pulsesTotal` increments. The
firmware's PCNT counts edges per window. The pin level for the 3D LED is `(pulsesTotal % 2 === 0) ? HIGH : LOW`.

### 6.8 Relay and supply (`relay.ts`, `supply.ts`)

- Input: `gpio26` level from the firmware. Coil on when `gpio26 === 'LOW'` (low-level trigger).
- Contact: moves to NO after `pullIn_s` of continuous coil-on; returns to NC after `release_s` of coil-off.
- `relayNoClosed = contact === 'NO'`. The 12 V switched net is energised iff `relayNoClosed`.
- Supply: `v_V − supplySag_V` while a sag fault is set; the adapter is always plugged in.

### 6.9 Faults (`faults.ts`)

Keys: `imbalance_g, looseness, friction, overheat, supplySag_V, packetLoss, ds18b20Disconnect (boolean)`.
`set(key, target, ramp_s = 0)`: with `ramp_s > 0` the value moves linearly from its current value to the target
over `ramp_s` of sim time. `clearAll()` sets every key to 0/false immediately. Every change emits a `FAULT_SET` event.

### 6.10 Step order (`plant.ts`, one call per `dt`)

1. Apply scheduled actions (scenario script, UI commands queued for this step) and fault ramps.
2. If this step is on a 1 ms boundary: call `firmware.tick(sensorsView)`. The firmware reads sensor outputs as they
   stood at the end of the previous step and sets `gpio26`.
3. Relay physics → supply → fan (ω, θ, I) → thermal and probe → vibration and DLPF → tach.
4. Deliver any due link messages (§7.5).

Determinism: one RNG stream per subsystem (`plant`, `mpu`, `acs`, `adc`, `link`, `rcf-tree-<i>`) derived from
`CONFIG.seed` with `rng.ts`'s `stream(seed, name)`.

---

## 7. Firmware mirror (`src/firmware/`)

Runs at 1 kHz inside the plant step. It only sees what the real ESP32 would see: sampled sensor values, PCNT
counts, DS18B20 readings, received verdicts and commands, and its own clock.

### 7.1 Sampling (`sampler.ts`)

- 1 kHz: append accel (x, y, z in g) and ADC counts to the window buffers.
- DS18B20: request a conversion every `period_s`, read it `conversion_s` later.
- PCNT: count tach rising edges per window.
- At `window_s` boundaries (window k covers `[k, k+1)` s): hand the buffers to `features.ts`, then clear them.

### 7.2 Features (`features.ts`), N = sampleRate · window_s = 1000

```
counts0           = mean ADC counts during CALIBRATING (relay open, I = 0)
i_n               = (counts_n − counts0) · (vSpan / maxCount) · (rTop + rBottom)/rBottom / sens      (A)
Δa_k,n            = a_k,n − mean_n(a_k)                                k ∈ {x, y, z}
a_rms_g           = sqrt( (1/N) Σ_n (Δax² + Δay² + Δaz²) )
cf                = max_k ( max_n |Δa_k,n| / max(1e-6, sqrt((1/N) Σ_n Δa_k,n²)) )
i_rms_A           = sqrt( (1/N) Σ_n i_n² )
t_C               = last valid DS18B20 reading, else null
dtdt_C_per_min    = 60 · OLS slope of (t_s, T) over valid readings in the last dtdtSpan_s, null if fewer than dtdtMinSamples
rpm               = edges · 60 / (tachPulsesPerRev · window_s)
```

A reading is valid unless it equals `disconnected_C`, or equals `powerOn_C` as the first reading after boot, or
differs from the last valid reading by more than `tJumpReject_C`.

The crest factor is computed per axis, then the maximum is taken. A pure rotating imbalance has a constant vector
magnitude, so a crest factor of the magnitude would always be about 1.

### 7.3 Local limits and flags (`limits.ts`), evaluated at each window end

| Name | Condition | Effect |
| --- | --- | --- |
| I_MAX | `i_rms_A > iMax_A` for `nILimit` consecutive windows in NORMAL/WARNING; `> iMaxStart_A` in STARTING | → CRITICAL (`I_MAX`) |
| T_MAX | valid `t_C > tMax_C` in STARTING/NORMAL/WARNING | → CRITICAL (`T_MAX`) |
| STALL | `rpm < stallFraction · rpmRated` for `nStall` consecutive windows in NORMAL/WARNING | → CRITICAL (`STALL`) |
| I_SOFT | `i_rms_A > iWarnFraction · iMax_A` | NORMAL → WARNING (`I_SOFT`) |
| T_SOFT | valid `t_C > tMax_C − tWarnMargin_C` | NORMAL → WARNING (`T_SOFT`) |
| SENSOR | no valid reading for `sensorFaultTimeout_s` | `sensor_fault = true`; NORMAL → WARNING (`SENSOR`) |
| LINK | no verdict received for `link.lossTimeout_s` while running | `link_lost = true` (no state change; RCF rules pause) |

### 7.4 State machine (`stateMachine.ts`)

States: `OFF, CALIBRATING, STARTING, NORMAL, WARNING, CRITICAL`. GPIO26 is `LOW` only in STARTING, NORMAL and
WARNING.

Counters: `alertRun` counts consecutive received verdicts with `alert = true`. A verdict with `alert = false`
resets it to 0; a dropped verdict leaves it unchanged. `clearRun` counts consecutive verdicts with `clear = true`
while no soft or sensor condition holds.

| From | Trigger | Guard | To | Actions |
| --- | --- | --- | --- | --- |
| OFF | cmd START | — | CALIBRATING | start counts0 averaging; log INFO |
| CALIBRATING | `calib_s` elapsed | — | STARTING | counts0 fixed; GPIO26 LOW |
| STARTING | `startGrace_s` elapsed | — | NORMAL | reset counters |
| STARTING | T_MAX or I_MAX (start limit) | — | CRITICAL | trip |
| NORMAL | verdict alert | not link_lost | WARNING | `alertRun = 1`, warn_reason RCF |
| NORMAL | I_SOFT / T_SOFT / SENSOR | — | WARNING | warn_reason set |
| WARNING | verdict alert | `alertRun ≥ nCritical` after increment | CRITICAL | trip (`RCF`) |
| WARNING | verdict clear | `clearRun ≥ nClear` after increment | NORMAL | warn_reason null |
| NORMAL, WARNING | I_MAX / T_MAX / STALL | — | CRITICAL | trip (reason) |
| any except OFF | cmd ESTOP | — | CRITICAL | trip (`ESTOP`) |
| CRITICAL | cmd RESET | `rpm < resetMaxRpm` | OFF | clear trip_reason, flags, counters |
| CRITICAL | cmd START | — | CRITICAL | refuse; log `ERR start refused: latched` |
| CRITICAL | cmd RESET | `rpm ≥ resetMaxRpm` | CRITICAL | refuse; log `WARN reset refused: fan still turning` |

Trip = set GPIO26 HIGH in the same tick, set `trip_reason`, emit a `CRITICAL` event, and log ERR. While in
STARTING, RCF verdicts are ignored.

Verdicts drive the RCF rows when they arrive (event-driven); limits are evaluated at each window end.

### 7.5 Link model (`link.ts`)

- Uplink: at each window end the firmware emits one packet (§10.1) in every state. With probability `packetLoss`
  it is dropped; otherwise it goes to the RCF.
- Downlink: a verdict is delivered to the firmware at `t_window_end + latency_s + U(−jitter, +jitter)`, or later if
  the RCF answers later (app only). Commands from the UI are not affected by `packetLoss`; they are delivered the
  next tick.
- `link_lost` per §7.3; it clears on the next verdict received.

### 7.6 Reference C++ and `@map` markers

`src/firmware/reference-cpp/` holds Arduino-style C++ (ESP32 core 3.x) written for reading, not compiling in CI.
Each decision point in the TS firmware carries a comment `// @map <id>` and the same marker sits on the equivalent
C++ line. IDs: `sm.off.start, sm.calib.done, sm.start.done, sm.normal.alert, sm.normal.soft, sm.warn.alert,
sm.warn.trip, sm.warn.clear, sm.limit.imax, sm.limit.tmax, sm.limit.stall, sm.estop, sm.reset.ok,
sm.reset.refused, sm.start.refused, feat.arms, feat.cf, feat.irms, feat.temp, feat.dtdt, feat.rpm, relay.on,
relay.off, link.lost`. The firmware sets `activeMap` in the snapshot to the last marker it executed; M8 highlights
that C++ line.

### 7.7 Logs (`logger.ts`)

Format: `[t=000123.456] LEVEL module: message`, LEVEL ∈ `INFO, WARN, ERR`. Required lines: every state change,
every refusal, link lost/restored, sensor fault on/off, calibration result (`counts0=1527.3`), every trip with its
reason and the feature values.

---

## 8. UI modules (`src/ui/`, `src/scene/`)

### 8.1 Layout

CSS grid: top bar 48 px; left column 320 px (M4 over M5); centre viewport (M1); right column 340 px (M3 over M9);
bottom dock 280 px, resizable 160–480 px, tabs M6 / M7 / M8 / M10. M11 is an overlay card at the viewport's
bottom-left; M12 is a modal. Minimum supported 1280 × 720; below 1280 px wide, the side columns stack under the
viewport. Light and dark themes.

State colours: OFF grey, CALIBRATING and STARTING blue, NORMAL green, WARNING amber, CRITICAL red.

### 8.2 Modules and test IDs

| # | Module | Must show | Controls (`data-testid`) |
| --- | --- | --- | --- |
| M1 | 3D viewport | §13 scene; hover tooltip with the live value; selection outline | `viewport`; camera presets `cam-overview`, `cam-fan`, `cam-esp32`, `cam-relay`, `cam-breadboard`; toggles `tgl-flow`, `tgl-labels`, `tgl-airflow`, `tgl-heat`; `sld-vib-exaggeration` (1–50) |
| M2 | Top bar | `sim-clock` (mm:ss.s), `fps`, mode label | `btn-play`, `sel-speed`, `btn-sim-reset`, `sel-scenario`, `sel-mode` (disabled until P8), `btn-theme`, `btn-help` |
| M3 | Status panel | `status-badge` (state text), `rcf-gauge` (score / threshold), `dominant-var`, `persistence` ("k/N"), `relay-state` ("CH2 NO closed" / "CH2 open"), `rpm-readout`, `link-indicator`, `sensor-indicator`, `trip-reason` | — |
| M4 | Fault injection | Current value of each fault | `sld-imbalance`, `sld-looseness`, `sld-friction`, `sld-overheat`, `sld-sag`, `sld-loss`, `tgl-ds-disconnect`, `tgl-ramp`, `inp-ramp-s`, `btn-clear-faults` |
| M5 | Operator | `model-status` (UNTRAINED / TRAINING n/180 / READY), latched indicator | `btn-start`, `btn-estop`, `btn-reset` (opens `dlg-reset-confirm` with `btn-reset-confirm`), `btn-train`, `tgl-warm-start`, `inp-threshold`, `inp-n-critical`, `inp-i-max`, `inp-t-max` |
| M6 | Live charts | Six strips: a_RMS, CF, I_RMS, T (+ dT/dt on a second axis), RPM, score with threshold line; state bands; event markers | `chart-arms`, `chart-cf`, `chart-irms`, `chart-temp`, `chart-rpm`, `chart-score`, `sel-chart-window`, `btn-chart-freeze` |
| M7 | Data console | Uplink packets (`↑ #1042 NORMAL a=0.121g cf=2.50 I=0.181A T=34.06°C dT=0.00/min rpm=3810`), verdicts (`↓ #1042 score=0.21/0.50 clear dom=cf`), commands, log lines; click a line to expand its JSON | `console`, `flt-packets`, `flt-verdicts`, `flt-commands`, `flt-logs`, `btn-console-pause`, `btn-console-copy`, `btn-export-csv`, `btn-export-json`, `tgl-raw-mpu` |
| M8 | Code panel | Read-only C++ from `reference-cpp/`, syntax-highlighted; the active line carries `data-active="true"` | `code-panel`, `tab-code-firmware`, `tab-code-schema`, `tab-code-rcf`, `tgl-follow` |
| M9 | Inspector | Selected component: name, photo crop, key specs, pins with live values (e.g. `ACS712 OUT 2.533 V → GPIO34 1965 counts`), its wires | `inspector` |
| M10 | Test log | One row per run: scenario/condition, start, duration, alerted (y/n), time to first alert (s), time from CRITICAL to relay open (ms), reset by operator (y/n), notes | `testlog-table`, `btn-run-start`, `btn-run-stop`, `inp-run-notes`, `btn-testlog-export` |
| M11 | Guided scenarios | Card with step text, step k/n | `scenario-card`, `btn-scn-next`, `btn-scn-back`, `btn-scn-exit` |
| M12 | Legend and help | Wire colour key, state colours, shortcuts, glossary (§14) | `legend-modal` |

Rules:
- `btn-reset` is enabled only in CRITICAL. `btn-start` is enabled only in OFF. `btn-train` is enabled only in NORMAL
  with no active fault and `|dtdt| ≤ warmDtdtMax`.
- Keyboard: Space play/pause, S start, E e-stop, R reset (opens the confirm dialog), 1–5 camera presets, ? help.
- CSV export columns: every packet field, then `score, threshold, alert, clear, dominant` joined by `seq`.
- Debug hook: with `?debug=1`, expose `window.__sim = { fps, state, t_s, scenarioDone, lastEvent }` for Playwright.

---

## 9. RCF and laptop logic (`src/rcf/`)

### 9.1 Robust Random Cut Forest (`rrcf.ts`)

Implement RRCF per Guha et al. 2016 (ICML), matching the behaviour of Python `rrcf` 0.4.4
(https://github.com/kLabUM/rrcf). Each tree uses its own seeded RNG stream `rcf-tree-<i>`.

- Nodes: `Branch { dim, cut, left, right, n, bboxMin[], bboxMax[] }`, `Leaf { keys[], point[], n }`.
- `insertPoint(point, key)`: empty tree → one leaf. Otherwise descend from the root. At each node, take the bounding
  box of the node plus the point, `span_d = max_d − min_d`, draw `r ~ U(0, Σ span)`, pick the dimension where the
  cumulative span passes r, and set `cut = min_d + (r − cumulativeBefore)`. If that cut separates the point from the
  node's existing box, create a new branch here with the point's leaf on its side; otherwise descend to the child on
  the point's side. A point equal to an existing leaf's point joins that leaf (`n += 1`, key added). Update `n` and
  boxes on the path.
- `forgetPoint(key)`: decrement or remove the leaf; a removed leaf's sibling replaces the parent; update `n` and
  boxes up to the root.
- `codisp(key)`: walk from the leaf to the root; at each step `ratio = n(sibling) / n(current subtree)`; return the
  maximum ratio.

### 9.2 Normalisation (`normalise.ts`)

`z_k = (x_k − μ_k) / max(σ_k, stdFloor_k)`, with μ and σ (population std) from the training windows.

### 9.3 Model (`model.ts`)

- **Train:** collect `nTrain + nHoldout` packets with `state = NORMAL` and no null feature. Training aborts
  (`UNTRAINED`, log WARN) if the state leaves NORMAL. Fit μ, σ on the first `nTrain`; insert those z-points into
  each of `numTrees` trees (keys 0…nTrain−1).
- **Score one packet:** if the state isn't NORMAL/WARNING or any feature is null → `score = null`. Otherwise, for
  each tree, insert z under key `"tmp"`, take `codisp("tmp")`, forget `"tmp"`.
  `score = mean(codisp) / nTrain` (≈ 0 for normal points, approaching 1 for isolated ones).
- **Verdict:** `alert = score > threshold`; `clear = score < clearHysteresis · threshold`;
  `dominant = argmax_k |z_k|`; include the full z map. z contains exactly the keys in `rcf.features`.
- **Validate:** score the holdout; if `max ≥ holdoutMaxRatio · threshold` → `UNTRAINED` with
  `reason: "baseline unstable"`, else `READY`.
- **Serialise:** `{ version, seed, features, mean, std, trainZ, threshold, nTrain, holdoutMax, source }`.
  Loading rebuilds the forest from `trainZ` + `seed`, so a loaded model scores bit-for-bit like the original.

### 9.4 Default model

`pnpm gen:model` runs `harness/trainDefault.ts`: warm start, seed `CONFIG.seed`, a healthy run with one stop and
restart (`DEFAULT_TRAINING` in `shared/scenarios.ts`: START at t = 0, ESTOP at 100 s, RESET at 120 s, START at 121 s,
end 240 s). Training takes the NORMAL windows from 16 (after calibration, grace and 5 s settling) up to the stop,
interleaved one-to-one with the windows that start after the run is NORMAL again, until `nTrain + nHoldout` are
collected, so a restart's thermal transient is part of the baseline (D-041). The UI loads `public/models/default-model.json` at boot
(status READY); `btn-train` retrains on the live sim.

---

## 10. Protocol, workers, store, harness

### 10.1 Protocol (`shared/protocol.ts`, zod)

```ts
export const PROTOCOL_VERSION = 1;
export const FeatureKey = z.enum(['a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min', 'rpm']);
export const State = z.enum(['OFF', 'CALIBRATING', 'STARTING', 'NORMAL', 'WARNING', 'CRITICAL']);
export const TripReason = z.enum(['RCF', 'I_MAX', 'T_MAX', 'STALL', 'ESTOP']);
export const WarnReason = z.enum(['RCF', 'I_SOFT', 'T_SOFT', 'SENSOR']);

export const Packet = z.object({            // ESP32 → laptop, one per window
  v: z.literal(PROTOCOL_VERSION), kind: z.literal('packet'),
  seq: z.number().int().nonnegative(), ts_ms: z.number().int().nonnegative(), win_ms: z.number().int().positive(),
  a_rms_g: z.number().finite().nonnegative(), cf: z.number().finite().nonnegative(),
  i_rms_A: z.number().finite().nonnegative(), t_C: z.number().finite().nullable(),
  dtdt_C_per_min: z.number().finite().nullable(), rpm: z.number().finite().nonnegative(),
  state: State, relay_ch2: z.enum(['ON', 'OFF']),
  link_lost: z.boolean(), sensor_fault: z.boolean(),
  warn_reason: WarnReason.nullable(), trip_reason: TripReason.nullable(),
});
export const Verdict = z.object({           // laptop → ESP32, one per scored packet
  v: z.literal(PROTOCOL_VERSION), kind: z.literal('verdict'),
  seq_ref: z.number().int().nonnegative(), score: z.number().finite().nonnegative().nullable(),
  threshold: z.number().positive(), alert: z.boolean(), clear: z.boolean(),
  dominant: FeatureKey.nullable(), z: z.partialRecord(FeatureKey, z.number().finite()).nullable(),
  model: z.enum(['UNTRAINED', 'TRAINING', 'READY']),
});
export const Command = z.object({           // operator → ESP32
  v: z.literal(PROTOCOL_VERSION), kind: z.literal('command'),
  seq: z.number().int().nonnegative(), cmd: z.enum(['START', 'RESET', 'ESTOP']),
});
```

This replaces the earlier draft where the laptop sent STOP. The laptop now sends a verdict for every window, and
the ESP32 owns persistence, limits and the relay (slides p. 13: "the ESP32 keeps the local response").

### 10.2 Worker messages (`shared/messages.ts`)

- Main → sim: `init{config, seed, warmStart}`, `play`, `pause`, `speed{x}`, `reset`,
  `fault{key, value, ramp_s}`, `clearFaults`, `command{Command}`, `scenario{id}`, `raw{on}`, `ping{id}`.
- Sim → main: `snapshot{Snapshot}` (≤ `snapshotHz`), `packet{Packet}`, `verdictIn{Verdict}`, `log{line}`,
  `event{SimEvent}`, `raw{ax, ay, az: Float32Array}` (transferable, only when on), `pong{id}`.
- Sim ↔ RCF over a `MessageChannel` created by main ("Wi-Fi"): sim → `packet`, RCF → `verdict`.
- Main → RCF: `loadModel{json}`, `train`, `setThreshold{x}`. RCF → main: `modelStatus{status, progress, reason?}`,
  `verdict{Verdict}` (copy for the UI).
- `Snapshot`: `t_s, rpm, omega_radps, theta_rad, fanV_V, current_A, tMotor_C, tProbe_C, coilOn, contact ('NC'|'NO'),
  gpio26, state, faults, accel_g [x, y, z], acsOut_V, adcPin_V, adcCounts, dsReading_C, tachHigh, alertRun,
  nCritical, linkLost, sensorFault, tripReason, activeMap`.
- Pacing in `sim/worker.ts`: each 4 ms wall tick, run `round(elapsedWall · speed / dt)` steps, capped at 0.2 s of
  sim time per tick (if it falls behind, slow down and set `lagging = true`).

### 10.3 Store (`store/`)

Slices: `sim` (snapshot, playing, speed, lagging), `series` (ring buffers of 600 windows for each chart),
`console` (ring buffer of `consoleMaxLines`), `model` (status, threshold, last verdict), `ui` (selectedId,
camera, toggles, dock tab, theme), `testlog` (runs). Components subscribe with selectors; the 3D scene reads the
snapshot through `useFrame` without React re-renders.

### 10.4 Harness (`harness/runScenario.ts`)

`runScenario(scenario, { seed, config, model }) → { packets, verdicts, logs, events, timeline }`, single-threaded:
plant + firmware + RCF in one loop, verdicts delivered per §7.5 with jitter drawn from the `link` stream. The same
seed and script must produce byte-identical JSON output. All `tests/scenario/*` tests use it; the workers reuse the
same `plant`, `firmware` and `model` modules.

Event types: `FAULT_SET, START, CALIBRATED, NORMAL, ALERT, WARNING, CRITICAL, RELAY_OPEN, RELAY_CLOSED, RESET,
LINK_LOST, LINK_RESTORED, SENSOR_FAULT, SENSOR_OK, REFUSED`.

---

## 11. Phases and tasks

### 11.1 Dependency graph

```
P0 ──┬── P1 (3D scene) ───────────────┐
     └── P2 (plant) → P3 (firmware) → P4 (RCF + harness) ──┴── P5 (UI) → P6 (animation) → P7 (delivery) → P8 (live, optional)
```

P1 can run in parallel with P2–P4. Inside a phase, tasks run in the listed order unless they say otherwise.

### P0 — Setup and contracts

**P0.1 Scaffold.** Files: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`,
`.prettierrc`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`. Scripts as in `AGENTS.md`;
Vitest configured inside `vite.config.ts`; ESLint `no-restricted-imports` for rule 4.
Accept: [auto] `pnpm verify` passes on a placeholder test · [auto] `pnpm build` writes `dist/index.html`.

**P0.2 Docs.** Ensure `docs/PROGRESS.md` and `docs/DECISIONS.md` exist (seeded versions ship with this plan).
Accept: [auto] a test asserts every task ID in §11 appears in `PROGRESS.md`.

**P0.3 Config and units.** Files: `shared/config.ts` (§5.1 verbatim), `shared/units.ts` (rpm↔rad/s, g↔m/s²).
Accept: [auto] `units.test.ts` round-trips · [auto] a test asserts `iIdle_A + iAero_A === 0.18`.

**P0.4 RNG.** File: `shared/rng.ts` — sfc32 generator, `stream(seed, name)` (name hashed with FNV-1a), `uniform()`,
`normal(μ, σ)` (Box–Muller with a cached spare).
Accept: [auto] same seed + name → same 1,000 values · [auto] different names → different sequences ·
[auto] 100,000 normals have mean within 0.01 and std within 0.01 of (0, 1).

**P0.5 Protocol.** Files: `shared/protocol.ts` (§10.1), `scripts/export-schema.ts`.
Accept: [auto] a valid packet, verdict and command parse · [auto] missing field, wrong enum, NaN and negative
`seq` are rejected · [auto] `pnpm gen:schema` writes three JSON Schema files.

**P0.6 Workers and messages.** Files: `shared/messages.ts`, `sim/worker.ts`, `rcf/worker.ts` (stubs), wiring in
`App.tsx` including the MessageChannel.
Accept: [e2e] ping → pong round trip under 50 ms for both workers · [e2e] a packet posted by the sim stub reaches
the RCF stub through the channel.

**P0.7 Store skeleton.** Files: `store/index.ts`, `store/slices/*.ts`.
Accept: [auto] each slice's actions update state as typed; the ring buffers drop the oldest entries past capacity.

### P1 — 3D bench scene (static)

**P1.1 Component catalogue and anchors.** Files: `shared/components.ts` (§13.2 table as data),
`scene/anchors.ts` (pin anchor IDs → local positions per component; world positions computed from the layout).
Accept: [auto] every anchor referenced in `shared/wiring.ts` exists · [auto] no two components' bounding boxes
intersect.

**P1.2 Models.** Files: `scene/models/*.tsx`. Procedural primitives at §13.2 sizes, PCB colours, header pins,
screw terminals, relay cubes, fan frame with 7 blades and hub, steel probe, resistors with colour bands. Use photo
crops from `assets/photos/` as PCB textures in `public/textures/` when present; otherwise flat colours.
Accept: [auto] each model's bounding box is within 5% of its §13.2 size · [human] each part is recognisable next
to its photo.

**P1.3 Layout.** File: `scene/Bench.tsx` placing components at §13.2 positions.
Accept: [e2e] the scene renders with no console errors · [human] the layout reads like a tidy lab bench.

**P1.4 Wires.** Files: `shared/wiring.ts` (§13.3 as data), `scene/wires/Wire.tsx`, `Wires.tsx`, `WifiArc.tsx`.
Each wire is a tube (radius 0.8 mm) along a Catmull–Rom curve from anchor to anchor through via points that lift
it 10–30 mm above the bench.
Accept: [auto] `wiring.test.ts` asserts the exact W01–W29 list (endpoints, net, colour) from §13.3 ·
[human] no wire passes through a component.

**P1.5 Cameras and selection.** Files: `scene/cameras.ts`, selection in `Bench.tsx`. Five presets with a 600 ms
eased transition; hover outline; click sets `ui.selectedId`.
Accept: [e2e] each `cam-*` button changes the camera and the screenshot differs from the previous one ·
[e2e] clicking the fan sets `selectedId = "fan"`.

**P1.6 Look.** Lighting, ContactShadows, environment, light/dark theme, LED bloom.
Accept: [human] at least 50 fps at 1920 × 1080 on an integrated-graphics laptop · [auto] GLB/texture assets in
`public/` total under 5 MB.

### P2 — Plant (`src/sim/`)

**P2.1 Fan** (§6.1). Accept [auto]: settles at 3,800 RPM ±2% and 0.18 A ±5% at 12 V within 5 s ·
spin-up peak current ≤ 0.33 A · friction 0.3 lowers RPM by 7.5% ±0.5% and raises I above 0.24 A ·
coast-down from 3,800 RPM to < 100 RPM in ≤ 12 s · V < 4 V gives zero current.

**P2.2 Thermal** (§6.2). Accept [auto]: warm start = 34.07 ± 0.05 °C and, with the fan held at rated speed and
current, stays within ±0.1 °C over 600 s ·
overheat 1.0 drives the steady state to 69.1 ± 0.5 °C · the 63% rise time after an ambient step is 160–200 s.

**P2.3 Faults** (§6.9). Accept [auto]: a step applies on the next step · a 30 s ramp hits 50% at 15 s ±1 step ·
`clearAll` zeroes all · every change emits `FAULT_SET`.

**P2.4 Sensors** (§6.4–§6.7). Accept [auto]: ACS712 noiseless output = 2.500 V at 0 A and 2.5 + 0.185·I ·
ADC counts stay in [0, 4095] and include the INL term · MPU output is quantised to 1/16384 g and clips at ±2 g ·
DS18B20 first reading is 85.0, later ones are multiples of 0.0625, the disconnect gives −127, and readings appear
every 1 s, 0.75 s after the request · tach gives 2 edges per revolution (± 1 per window).

**P2.5 Relay and supply** (§6.8). Accept [auto]: NO closes 10 ms after GPIO26 goes LOW and opens 5 ms after it goes
HIGH · the fan voltage is 0 while the contact is NC · sag 2 V lowers the fan voltage to 10 V.

**P2.6 Plant integration** (§6.10, `plant.ts`). Accept [auto]: same seed + same fault script → identical arrays
(JSON byte-equal) · imbalance 0.3 g raises the firmware-free a_RMS (computed in the test) by ≥ 3× while I_RMS changes
< 5% · 600 s of sim runs in < 3 s of wall time in Node.

**P2.7 Sim worker** (§10.2). Accept [e2e]: at speed 10× the sim clock advances 10 ± 0.5 s per 1 s of wall time
on the CI machine, or reports `lagging` · pause stops the clock.

### P3 — Firmware mirror (`src/firmware/`)

**P3.1 Sampler** (§7.1). Accept [auto]: 1,000 accel and ADC samples per window · DS18B20 request/read timing ·
PCNT edge count matches the plant's revolutions × 2 ± 1.

**P3.2 Features** (§7.2) + `scripts/features_reference.py` + `tests/fixtures/features_*.json` (5 fixed windows:
healthy, imbalance, looseness, friction, sensor-null). Accept [auto]: TS features match the NumPy reference
within 1e-6 relative · a pure sine axis gives CF = √2 ± 0.01 · dT/dt is null with fewer than 10 valid readings.

**P3.3 Limits and flags** (§7.3). Accept [auto]: one truth-table test per row of §7.3.

**P3.4 State machine** (§7.4). Accept [auto]: one test per transition row · GPIO26 is LOW exactly in STARTING,
NORMAL, WARNING · four alerts then one non-alert do not trip; five consecutive alerts do · a dropped verdict
does not reset `alertRun` · START in CRITICAL is refused and logged.

**P3.5 Link** (§7.5). Accept [auto]: packetLoss 1.0 → `link_lost` within 5 s + 1 window; first verdict after
restore clears it · latency stays within 20 ± 10 ms.

**P3.6 Firmware orchestrator and logs** (`firmware.ts`, `logger.ts`, §7.7). Accept [auto]: a healthy 60 s run
from START produces 60 valid packets (zod-parsed), states OFF→CALIBRATING→STARTING→NORMAL in order, and the
required log lines · CRITICAL → contacts open within 20 ms of sim time.

**P3.7 Reference C++** (§7.6). Accept [auto]: every `@map` ID in the TS firmware appears exactly once in
`reference-cpp/` and vice versa · [human] the C++ reads as plausible ESP32 Arduino code.

### P4 — RCF and harness (`src/rcf/`, `src/harness/`)

**P4.1 RRCF** (§9.1). Accept [auto]: insert/forget keeps `n` and bounding boxes consistent (property test, 1,000
random operations) · duplicates are handled · a far outlier has codisp ≥ 0.8 · n, a central point ≤ 0.2 · n.

**P4.2 Normalise** (§9.2). Accept [auto]: floors apply; μ/σ match NumPy on a fixture.

**P4.3 Model** (§9.3). Accept [auto]: train → serialise → load gives identical scores · null features give
`score = null` · holdout validation rejects a deliberately noisy baseline.

**P4.4 RCF worker.** Accept [e2e]: loads `default-model.json` at boot (`model-status` = READY) · returns a
verdict for each packet within 20 ms of wall time.

**P4.5 Harness, scenarios and default model** (§10.4, §12; files `harness/*`, `shared/scenarios.ts`,
`scripts/train-default-model.ts`, `scripts/gen-fixtures.ts`). Accept [auto]: every row of §12 passes as a test in
`tests/scenario/` · two runs with the same seed give byte-identical results.

**P4.6 Python cross-check.** `scripts/rrcf_reference.py` scores `tests/fixtures/rcf_dataset.json` (generated by
`gen:fixtures`: 120 healthy training windows + 60 test windows mixing healthy and the four faults) with
`rrcf` 0.4.4, 40 trees. Accept [auto, optional in CI if Python is present]: Spearman rank correlation between the
TS and Python scores ≥ 0.90.

### P5 — Interface modules

**P5.1 Shell and layout** (§8.1): `AppShell.tsx`, `Dock.tsx`. Accept [e2e]: all regions present at 1280 × 720 and
1920 × 1080; side columns stack at 1100 px wide.

**P5.2 M2 top bar.** **P5.3 M3 status.** **P5.4 M4 faults.** **P5.5 M5 operator.** **P5.6 M6 charts.**
**P5.7 M7 console + exports.** **P5.8 M9 inspector.** **P5.9 M10 test log.** **P5.10 M12 legend.**
Each: build the module with every test ID in §8.2 and the rules under the table.
Accept for each [e2e]: every listed test ID exists and is visible; each control changes the store as specified.

**P5.G Phase gate** [e2e]: with the default model, click `btn-start`, wait for NORMAL, set `sld-imbalance` to 0.3 → the
`status-badge` reads CRITICAL within 15 s of sim time, `trip-reason` reads RCF, `btn-reset` becomes enabled;
reset with confirm → OFF · exported CSV parses with the same row count as console packets · [human] a teammate
runs a fault and a reset without instructions.

### P6 — Animation and explanation

**P6.1 Blades and vibration.** Blades rotate by `theta_rad` below `bladeBlurRpm`; above it, crossfade to a
translucent blur disc. The frame jitters with amplitude `min(vibVisualMax_mm, a_rms_g · vibVisual_mm_per_g ·
exaggeration)` at `vibVisual_Hz`. Real 63 Hz motion would alias at 60 fps, so it's shown slowed down and labelled
"slowed for visibility".
**P6.2 Signal flow.** Power nets glow while energised; data nets show pulses paced by real traffic (I²C and ADC
continuous, 1-Wire 1 Hz, packet 1 Hz); Wi-Fi arc pulses up per packet and down per verdict; dropped packets
flash red and fade.
**P6.3 Relay.** The CH2 contact arm moves NC2 → NO2 following `contact`; LED on with the coil; a click sound on
each change; W03 dims when open.
**P6.4 Heat and sound.** Hub tint from `tMotor_C` (blue 25 °C → red 70 °C); optional hum through Web Audio with
pitch from RPM and gain from a_RMS, muted by default.
**P6.5 M8 code panel** (§7.6). **P6.6 M11 guided scenarios** (§12, rows marked Guided).

Accept: [e2e] with the sim paused, two screenshots 1 s apart are identical · [e2e] on a trip the event order is
CRITICAL → RELAY_OPEN → rpm < 100 · [e2e] every guided scenario runs to its last step with `scenarioDone = true` ·
[e2e] in each state, M8's active line has the expected `@map` ID · [human] the animations make the cause and the
effect obvious to someone who hasn't read the report.

### P7 — Verification and delivery

**P7.1 Tests.** Coverage ≥ 80% for `sim/`, `firmware/`, `rcf/`, `harness/`.
**P7.2 Performance.** Instancing for header pins and breadboard holes; compressed textures; batched worker
messages.
**P7.3 Copy.** Help text, tooltips and glossary checked against the report's vocabulary.
**P7.4 Publish.** `pnpm build`, upload `dist/` as a static site.
Accept: [auto] coverage gate · [e2e] the full Playwright suite passes on Chromium · [human] first load under 4 s
on a normal connection · [human] the Baseline → Imbalance → Trip → Reset demo fits in 3 minutes.

### P8 — Live bridge (optional)

**P8.1** `bridge-py/app.py` (FastAPI + uvicorn): WebSocket `/esp32` for the board, `/ui` for the browser;
validates with the JSON Schemas from `public/schema/`; forwards packets up and verdicts/commands down; runs the
same RCF via the exported model JSON (Python `rrcf`).
**P8.2** `src/bridge/wsClient.ts` and `sel-mode` = Live: replaces the sim worker as the data source; the scene is
driven from packets (RPM, relay, state), with fields the board doesn't send shown as "—".
**P8.3** Replay: load an exported session JSON and play it through the UI at 1–10×.
**P8.4** Calibration: fit `fan.*`, `thermal.*` and sensor noise from a recorded healthy session.
Accept: [human] real packets render with no change outside `src/bridge/` · [human] `btn-estop` opens the real
relay · [auto] after calibration, the simulated baseline means are within 10% of the recorded ones.

---

## 12. Scenarios (`shared/scenarios.ts`; all: default model, warm start, seed `CONFIG.seed`, START at t = 0)

| ID | Guided | Script (sim time) | Must hold [auto] |
| --- | --- | --- | --- |
| S1 baseline | yes | run 600 s | never CRITICAL · ≤ 2 alert verdicts · max score < threshold · final state NORMAL |
| S2 imbalance | yes | t=60 imbalance_g 0.3 step; end 120 | first alert ≤ 63 s · CRITICAL (RCF) ≤ 70 s · dominant at first alert = a_rms_g · RELAY_OPEN ≤ CRITICAL + 20 ms · rpm < 100 by CRITICAL + 15 s |
| S3 looseness | no | t=60 looseness 0.6 step; end 120 | CRITICAL ≤ 70 s · dominant ∈ {a_rms_g, cf} |
| S4 friction | yes | t=60 friction → 0.5, ramp 30 s; end 140 | CRITICAL ≤ 75 s · reason ∈ {RCF, I_MAX} · dominant ∈ {i_rms_A, rpm} |
| S5 overheat | yes | t=60 overheat 1.0 step; end 140 | CRITICAL ≤ 80 s · dominant ∈ {t_C, dtdt_C_per_min} |
| S6 wifi-loss | yes | t=30 packetLoss 1.0; t=60 overheat 1.0; end 420 | link_lost by 36 s · no verdict delivered after 30.1 s · CRITICAL with reason T_MAX at 280–340 s |
| S7 sensor | no | t=60 ds18b20Disconnect on; end 300 | first −127 reading by 61 s · sensor_fault and WARNING (SENSOR) by 72 s · never CRITICAL |
| S8 reset-flow | no | t=60 imbalance 0.3; at CRITICAL+1 START; +5 clearFaults; +20 RESET; +21 START; end +45 | START at +1 refused · RESET accepted · NORMAL reached by +33 · no CRITICAL after the RESET |
| S9 false-alarm | yes | as S1 at 10× speed (UI only) | same as S1 |

M11 guided text, one card per step: what to watch (camera preset + chart), what was injected, what the state means.

---

## 13. 3D scene and wiring (`scene/`, `shared/components.ts`, `shared/wiring.ts`)

### 13.1 Coordinates

Metres, right-handed, y up. Bench top surface at y = 0, bench 0.90 × 0.45 m centred at (0.10, −0.01, 0).
Positions below are nominal component centres; an agent may move parts ±0.02 m to avoid overlaps if it keeps the
arrangement.

### 13.2 Components

| id | Part | Size (x × y × z, mm) | Position (m) | Notes |
| --- | --- | --- | --- | --- |
| fan | Delta AFB0712HB on a stand | 70 × 70 × 15 | (−0.20, 0.055, −0.05) | Face in the x–y plane, airflow +z; 7 blades; stand 20 mm |
| mpu6050 | GY-521 | 21 × 1.6 × 16 | (−0.20, 0.091, −0.05) | Flat on the frame's top edge |
| ds18b20 | Probe tip | Ø6 × 50 | (−0.20, 0.055, −0.06) | Taped to the hub, cable 1 m coiled |
| breadboard | 830-point | 165 × 9.5 × 55 | (0.05, 0.005, 0.08) | Long axis along x; left rail +=3V3, right rail +=5 V, both − = GND |
| esp32 | DevKit V1 30-pin | 52 × 13 × 28 | (0.02, 0.017, 0.08) | Straddles the centre channel; USB-C toward −x |
| r_pu_ds | 4.7 kΩ | 6 × 2.3 × 2.3 | on breadboard | DS18B20 pull-up |
| r_pu_tach | 10 kΩ | 6 × 2.3 × 2.3 | on breadboard | Tach pull-up |
| r_div_top / r_div_bot | 10 kΩ / 20 kΩ | 6 × 2.3 × 2.3 | on breadboard | ACS712 divider |
| acs712 | Current module | 31 × 12 × 13 | (0.00, 0.006, −0.10) | Terminals toward −x |
| relay | 2-ch module | 50 × 19 × 38 | (0.14, 0.0095, −0.08) | Terminals toward −z; CH1 marked unused |
| dcjack | Female barrel jack, screw terminals | 25 × 12 × 15 | (−0.12, 0.006, −0.15) | OPEN-6 |
| adapter | JSY-1220 12 V 1 A | 75 × 30 × 45 | (−0.30, 0.0225, −0.17) | Barrel cable to `dcjack` |
| laptop | Laptop | 320 × 220 (open) | (0.42, 0, 0.02) | Rotated −20° about y; screen shows a mini dashboard texture |

### 13.3 Wires (`shared/wiring.ts`)

Colour key: red `#d32f2f` (12 V), black `#212121` (GND), orange `#f57c00` (5 V), pink `#ec407a` (3V3), blue `#1e88e5`
(SDA), light blue `#4fc3f7` (SCL), yellow `#fdd835` (1-Wire), green `#43a047` (analog), violet `#8e24aa` (tach),
white `#eeeeee` (relay control), grey `#9e9e9e` (USB, barrel cable).

`bb.*` anchors: `bb.railL.p` (3V3), `bb.railL.n` (GND), `bb.railR.p` (5 V), `bb.railR.n` (GND), and nodes
`bb.node.dq`, `bb.node.tach`, `bb.node.divTop`, `bb.node.divMid` (breadboard rows chosen by the agent).
A wire to an ESP32 pin lands in the breadboard hole in the same row, outside the module; where no free hole exists,
it attaches at the pin.

| ID | From | To | Net | Colour |
| --- | --- | --- | --- | --- |
| W01 | adapter.plug | dcjack.barrel | V12 | grey |
| W02 | dcjack.plus | acs712.ipPlus | V12 | red |
| W03 | acs712.ipMinus | relay.com2 | V12 | red |
| W04 | relay.no2 | fan.red | V12_SW | red |
| W05 | fan.black | dcjack.minus | GND | black |
| W06 | dcjack.minus | bb.railR.n | GND | black |
| W07 | esp32.VIN | bb.railR.p | V5 | orange |
| W08 | esp32.3V3 | bb.railL.p | V3V3 | pink |
| W09 | esp32.GND | bb.railL.n | GND | black |
| W10 | bb.railL.n | bb.railR.n | GND | black |
| W11 | bb.railR.p | acs712.vcc | V5 | orange |
| W12 | bb.railR.n | acs712.gnd | GND | black |
| W13 | bb.railR.p | relay.jdvcc | V5 | orange |
| W14 | bb.railR.n | relay.gnd_a | GND | black |
| W15 | bb.railL.p | relay.vcc | V3V3 | pink |
| W16 | bb.railL.n | relay.gnd | GND | black |
| W17 | bb.railL.p | mpu6050.vcc | V3V3 | pink |
| W18 | bb.railL.n | mpu6050.gnd | GND | black |
| W19 | mpu6050.sda | esp32.D21 | SDA | blue |
| W20 | mpu6050.scl | esp32.D22 | SCL | light blue |
| W21 | ds18b20.red | bb.railL.p | V3V3 | pink |
| W22 | ds18b20.black | bb.railL.n | GND | black |
| W23 | ds18b20.yellow | bb.node.dq | ONEWIRE | yellow |
| W24 | bb.node.dq | esp32.D4 | ONEWIRE | yellow |
| W25 | acs712.out | bb.node.divTop | ANALOG | green |
| W26 | bb.node.divMid | esp32.D34 | ANALOG | green |
| W27 | fan.blue | bb.node.tach | TACH | violet |
| W28 | bb.node.tach | esp32.D27 | TACH | violet |
| W29 | esp32.D26 | relay.in2 | RELAY_IN | white |

Resistors (placed in breadboard holes, not wires): `r_pu_ds` between `bb.node.dq` and `bb.railL.p`; `r_pu_tach`
between `bb.node.tach` and `bb.railL.p`; `r_div_top` between `bb.node.divTop` and `bb.node.divMid`; `r_div_bot`
between `bb.node.divMid` and `bb.railL.n`. USB: a grey cable `esp32.usb → laptop.usb` (not in the wire list,
always energised). Wi-Fi: `WifiArc` between `esp32.antenna` and `laptop.screenTop`.

Energised rules: V12, GND: always · V12_SW: iff `contact === 'NO'` · V5, V3V3: always (USB powered) · data nets:
pulses per §11 P6.2 · RELAY_IN: lit while GPIO26 is LOW.

---

## 14. Glossary (also shown in M12)

- **a_RMS**: root mean square of the vibration (after removing the steady part), in g, per 1 s window.
- **Crest factor (CF)**: peak ÷ RMS; rises with impacts (looseness).
- **I_RMS**: RMS of the calibrated fan current, in A.
- **dT/dt**: temperature slope over the last 60 s, in °C/min.
- **RCF / RRCF**: (Robust) Random Cut Forest, an anomaly detector that scores how easily a point is isolated from
  the normal data.
- **CoDisp**: collusive displacement, the RRCF per-point score; here divided by the training size, so it runs ≈ 0–1.
- **Dominant variable**: the feature with the largest normalised deviation from the baseline.
- **NO / NC**: normally open / normally closed relay contact. The fan is on NO2, so it runs only while the coil is
  energised.
- **Persistence**: number of consecutive alert windows needed to trip (`nCritical`).
- **Latched**: after a trip the fan stays off until RESET, then START.
