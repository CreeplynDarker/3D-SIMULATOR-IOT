// features.cpp — window features (reference for reading; mirrors src/firmware/features.ts, spec §7.2).
// Called once per 1 s window with N = 1000 samples taken at 1 kHz.
#include <Arduino.h>
#include <math.h>

static constexpr int N = 1000;
static constexpr float V_SPAN = 3.05f, MAX_COUNT = 4095.0f;      // ADC1, 11 dB attenuation
static constexpr float R_TOP = 10000.0f, R_BOTTOM = 20000.0f;    // ACS712 OUT divider
static constexpr float ACS_SENS_V_PER_A = 0.185f;                // ACS712-05B
static constexpr float PULSES_PER_REV = 2.0f, WINDOW_S = 1.0f;
static constexpr float DS_DISCONNECTED_C = -127.0f, DS_POWER_ON_C = 85.0f, T_JUMP_REJECT_C = 10.0f;
static constexpr float DTDT_SPAN_S = 60.0f;
static constexpr int DTDT_MIN_SAMPLES = 10;

struct Features {
  float aRms_g, cf, iRms_A, rpm;
  bool tValid;
  float t_C;
  bool dtdtValid;
  float dtdt_C_per_min;
};

// Per-axis mean removal, then the vector a_RMS and the largest per-axis crest factor.
static void vibrationFeatures(const float ax[N], const float ay[N], const float az[N], Features &f) {
  const float *axes[3] = {ax, ay, az};
  double sumSq = 0.0;
  float cf = 0.0f;
  for (int k = 0; k < 3; k++) {
    double mean = 0.0;
    for (int n = 0; n < N; n++) mean += axes[k][n];
    mean /= N;
    double ss = 0.0, peak = 0.0;
    for (int n = 0; n < N; n++) {
      const double d = axes[k][n] - mean;
      ss += d * d;
      peak = fmax(peak, fabs(d));
    }
    sumSq += ss;
    cf = fmaxf(cf, (float)(peak / fmax(1e-6, sqrt(ss / N))));  // @map feat.cf
  }
  f.aRms_g = (float)sqrt(sumSq / N);  // @map feat.arms
  f.cf = cf;
}

// Raw counts -> amps through the divider and the ACS712 sensitivity, zero taken from calibration.
static void currentFeature(const uint16_t counts[N], float counts0, Features &f) {
  const float ampsPerCount = (V_SPAN / MAX_COUNT) * ((R_TOP + R_BOTTOM) / R_BOTTOM) / ACS_SENS_V_PER_A;
  double sq = 0.0;
  for (int n = 0; n < N; n++) {
    const double i = (counts[n] - counts0) * ampsPerCount;
    sq += i * i;
  }
  f.iRms_A = (float)sqrt(sq / N);  // @map feat.irms
}

// ---- DS18B20 readings: validity and the dT/dt history -------------------------------------------------------
struct Reading { float t_s, value_C; };
static Reading history[64];
static int historyLen = 0;
static bool firstReading = true;
static bool haveValid = false;
static Reading lastValid = {0, 0};

// Returns true if the reading is valid (spec §7.2) and keeps it for t_C and dT/dt.
bool addTemperature(float t_s, float value_C) {
  const bool first = firstReading;
  firstReading = false;
  if (value_C == DS_DISCONNECTED_C) return false;
  if (first && value_C == DS_POWER_ON_C) return false;
  if (haveValid && fabsf(value_C - lastValid.value_C) > T_JUMP_REJECT_C) return false;
  lastValid = {t_s, value_C};  // @map feat.temp
  haveValid = true;
  if (historyLen == 64) { memmove(history, history + 1, 63 * sizeof(Reading)); historyLen = 63; }
  history[historyLen++] = lastValid;
  return true;
}

// t_C = last valid reading; dT/dt = 60 x least-squares slope over the last 60 s, if at least 10 readings.
static void temperatureFeatures(float now_s, Features &f) {
  f.tValid = haveValid;
  f.t_C = lastValid.value_C;
  double st = 0, sT = 0;
  int n = 0;
  for (int k = 0; k < historyLen; k++) if (history[k].t_s >= now_s - DTDT_SPAN_S) { st += history[k].t_s; sT += history[k].value_C; n++; }
  f.dtdtValid = n >= DTDT_MIN_SAMPLES;
  if (!f.dtdtValid) return;
  const double mt = st / n, mT = sT / n;
  double sxy = 0, sxx = 0;
  for (int k = 0; k < historyLen; k++) {
    if (history[k].t_s < now_s - DTDT_SPAN_S) continue;
    sxy += (history[k].t_s - mt) * (history[k].value_C - mT);
    sxx += (history[k].t_s - mt) * (history[k].t_s - mt);
  }
  f.dtdt_C_per_min = (float)(60.0 * sxy / sxx);  // @map feat.dtdt
}

Features computeFeatures(const float ax[N], const float ay[N], const float az[N], const uint16_t counts[N],
                         float counts0, uint32_t tachEdges, float now_s) {
  Features f = {};
  vibrationFeatures(ax, ay, az, f);
  currentFeature(counts, counts0, f);
  f.rpm = tachEdges * 60.0f / (PULSES_PER_REV * WINDOW_S);  // @map feat.rpm
  temperatureFeatures(now_s, f);
  return f;
}
