// main.cpp — ESP32 DevKit V1 firmware (reference for reading, not compiled in CI; ESP32 Arduino core 3.x).
// Mirrors src/firmware/firmware.ts: 1 kHz sampling, 1 s windows, local limits, one JSON packet per window to the
// laptop over UDP, verdicts and operator commands back. Pin map: docs/PLAN.md §1.3.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <driver/pulse_cnt.h>
#include <esp_timer.h>

// ---- pins (§1.3) ---------------------------------------------------------------------------------------------
static constexpr uint8_t PIN_SDA = 21, PIN_SCL = 22;   // MPU6050, I2C at 400 kHz
static constexpr uint8_t PIN_DS18B20 = 4;              // 1-Wire, 4.7 k pull-up to 3V3
static constexpr uint8_t PIN_ACS712 = 34;              // ADC1_CH6 through the 10 k / 20 k divider
static constexpr uint8_t PIN_TACH = 27;                // open collector, 10 k pull-up to 3V3
static constexpr uint8_t MPU_ADDR = 0x68;

// ---- timing and limits (src/shared/config.ts) -----------------------------------------------------------------
static constexpr int N = 1000;                                   // samples per 1 s window
static constexpr uint32_t CALIB_MS = 500, START_GRACE_MS = 10000;
static constexpr uint32_t DS_PERIOD_MS = 1000, DS_CONVERSION_MS = 750;
static constexpr uint32_t LINK_TIMEOUT_MS = 5000, SENSOR_TIMEOUT_MS = 10000;
static constexpr float I_MAX_A = 0.30f, I_MAX_START_A = 0.40f, T_MAX_C = 60.0f, T_WARN_MARGIN_C = 5.0f;
static constexpr float I_WARN_FRACTION = 0.9f, STALL_RPM = 0.5f * 3800.0f;
static constexpr int N_I_LIMIT = 3, N_STALL = 3;

// ---- from the other reference files ---------------------------------------------------------------------------
enum class State : uint8_t { OFF, CALIBRATING, STARTING, NORMAL, WARNING, CRITICAL };
enum class Reason : uint8_t { NONE, RCF, I_MAX, T_MAX, STALL, ESTOP, I_SOFT, T_SOFT, SENSOR };
struct Fsm { State state; int alertRun, clearRun; Reason tripReason, warnReason; bool linkLost, softActive; float rpm; };
extern Fsm fsm;
struct Features { float aRms_g, cf, iRms_A, rpm; bool tValid; float t_C; bool dtdtValid; float dtdt_C_per_min; };
Features computeFeatures(const float ax[N], const float ay[N], const float az[N], const uint16_t counts[N],
                         float counts0, uint32_t tachEdges, float now_s);
bool addTemperature(float t_s, float value_C);
void relayInit();
void smCommandStart(); void smCommandReset(); void smCommandEstop();
void smCalibrationDone(); void smGraceDone();
void smLimitTrip(Reason r); void smSoftCondition(Reason r); void smVerdict(bool alert, bool clear);

// ---- state ----------------------------------------------------------------------------------------------------
OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);
WiFiUDP udp;
static pcnt_unit_handle_t tachUnit = nullptr;
static volatile bool tickDue = false;

static float ax[N], ay[N], az[N];
static uint16_t counts[N];
static int n = 0;
static uint32_t tickMs = 0, windowSeq = 0, stateSinceMs = 0;
static uint32_t lastVerdictMs = 0, lastValidTempMs = 0;
static double calibSum = 0; static uint32_t calibN = 0;
static float counts0 = 2047.0f;
static int iOverRun = 0, stallRun = 0;
static bool sensorFault = false;

void logLine(const char *level, const char *module, const char *fmt, ...) {
  char msg[160];
  va_list args; va_start(args, fmt); vsnprintf(msg, sizeof msg, fmt, args); va_end(args);
  Serial.printf("[t=%010.3f] %s %s: %s\n", tickMs / 1000.0, level, module, msg);
}

void startCalibration() { calibSum = 0; calibN = 0; stateSinceMs = tickMs; lastVerdictMs = tickMs; }

static void IRAM_ATTR onTick(void *) { tickDue = true; }

static void mpuWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(reg); Wire.write(value); Wire.endTransmission();
}

static void mpuRead(float &x, float &y, float &z) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B); Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, (uint8_t)6);
  const int16_t rx = (Wire.read() << 8) | Wire.read(), ry = (Wire.read() << 8) | Wire.read(), rz = (Wire.read() << 8) | Wire.read();
  x = rx / 16384.0f; y = ry / 16384.0f; z = rz / 16384.0f;   // ±2 g range
}

static void tachInit() {
  pcnt_unit_config_t unit = {.low_limit = -1, .high_limit = 32767};
  pcnt_new_unit(&unit, &tachUnit);
  pcnt_chan_config_t chan = {.edge_gpio_num = PIN_TACH, .level_gpio_num = -1};
  pcnt_channel_handle_t ch; pcnt_new_channel(tachUnit, &chan, &ch);
  pcnt_channel_set_edge_action(ch, PCNT_CHANNEL_EDGE_ACTION_INCREASE, PCNT_CHANNEL_EDGE_ACTION_HOLD);  // rising edges
  pcnt_unit_enable(tachUnit); pcnt_unit_clear_count(tachUnit); pcnt_unit_start(tachUnit);
}

void setup() {
  relayInit();                                  // fan off before anything else
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL, 400000);
  mpuWrite(0x6B, 0x00);                         // wake up
  mpuWrite(0x1A, 0x01);                         // DLPF 184 Hz
  mpuWrite(0x1C, 0x00);                         // ±2 g
  ds18b20.begin(); ds18b20.setResolution(12); ds18b20.setWaitForConversion(false);
  analogSetPinAttenuation(PIN_ACS712, ADC_11db);
  tachInit();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  udp.begin(4210);
  const esp_timer_create_args_t args = {.callback = onTick, .name = "sample"};
  esp_timer_handle_t timer; esp_timer_create(&args, &timer); esp_timer_start_periodic(timer, 1000);  // 1 kHz
}

static void sendPacket(const Features &f) {
  JsonDocument doc;
  doc["v"] = 1; doc["kind"] = "packet"; doc["seq"] = windowSeq; doc["ts_ms"] = tickMs; doc["win_ms"] = 1000;
  doc["a_rms_g"] = f.aRms_g; doc["cf"] = f.cf; doc["i_rms_A"] = f.iRms_A; doc["rpm"] = f.rpm;
  if (f.tValid) doc["t_C"] = f.t_C; else doc["t_C"] = nullptr;
  if (f.dtdtValid) doc["dtdt_C_per_min"] = f.dtdt_C_per_min; else doc["dtdt_C_per_min"] = nullptr;
  doc["state"] = (int)fsm.state; doc["link_lost"] = fsm.linkLost; doc["sensor_fault"] = sensorFault;
  udp.beginPacket(LAPTOP_IP, 4211); serializeJson(doc, udp); udp.endPacket();
}

// Local limits and flags at a window end (§7.3).
static void evaluateLimits(const Features &f) {
  const bool supervised = fsm.state == State::NORMAL || fsm.state == State::WARNING;
  const bool running = supervised || fsm.state == State::STARTING;
  iOverRun = (supervised && f.iRms_A > I_MAX_A) ? iOverRun + 1 : 0;
  stallRun = (supervised && f.rpm < STALL_RPM) ? stallRun + 1 : 0;
  sensorFault = tickMs - lastValidTempMs > SENSOR_TIMEOUT_MS;
  if (running && tickMs - lastVerdictMs > LINK_TIMEOUT_MS && !fsm.linkLost) {
    fsm.linkLost = true;  // @map link.lost
    logLine("WARN", "link", "link lost");
  }
  if (iOverRun >= N_I_LIMIT || (fsm.state == State::STARTING && f.iRms_A > I_MAX_START_A)) smLimitTrip(Reason::I_MAX);
  else if (running && f.tValid && f.t_C > T_MAX_C) smLimitTrip(Reason::T_MAX);
  else if (stallRun >= N_STALL) smLimitTrip(Reason::STALL);
  else if (f.iRms_A > I_WARN_FRACTION * I_MAX_A) smSoftCondition(Reason::I_SOFT);
  else if (f.tValid && f.t_C > T_MAX_C - T_WARN_MARGIN_C) smSoftCondition(Reason::T_SOFT);
  else if (sensorFault) smSoftCondition(Reason::SENSOR);
}

static void sampleTick() {
  tickMs++;
  if (n == N) {                                  // window end
    int edges = 0; pcnt_unit_get_count(tachUnit, &edges); pcnt_unit_clear_count(tachUnit);
    const Features f = computeFeatures(ax, ay, az, counts, counts0, edges, tickMs / 1000.0f);
    fsm.rpm = f.rpm;
    evaluateLimits(f);
    sendPacket(f);
    windowSeq++; n = 0;
  }
  mpuRead(ax[n], ay[n], az[n]);
  counts[n] = analogRead(PIN_ACS712);
  if (fsm.state == State::CALIBRATING) { calibSum += counts[n]; calibN++; }
  n++;
  if (tickMs % DS_PERIOD_MS == 0) ds18b20.requestTemperatures();
  if (tickMs % DS_PERIOD_MS == DS_CONVERSION_MS && addTemperature(tickMs / 1000.0f, ds18b20.getTempCByIndex(0)))
    lastValidTempMs = tickMs;
  if (fsm.state == State::CALIBRATING && tickMs - stateSinceMs >= CALIB_MS) {
    counts0 = calibSum / calibN;
    logLine("INFO", "fw", "calibration counts0=%.1f", counts0);
    stateSinceMs = tickMs; smCalibrationDone();
  } else if (fsm.state == State::STARTING && tickMs - stateSinceMs >= START_GRACE_MS) {
    smGraceDone();
  }
}

// Verdicts ({"kind":"verdict",...}) and operator commands ({"kind":"command",...}) from the laptop.
static void receive() {
  if (udp.parsePacket() == 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, udp)) return;
  if (doc["kind"] == "verdict") {
    lastVerdictMs = tickMs;
    if (fsm.linkLost) { fsm.linkLost = false; logLine("INFO", "link", "link restored"); }
    smVerdict(doc["alert"], doc["clear"]);
  } else if (doc["kind"] == "command") {
    const char *cmd = doc["cmd"];
    if (!strcmp(cmd, "START")) smCommandStart();
    else if (!strcmp(cmd, "RESET")) smCommandReset();
    else if (!strcmp(cmd, "ESTOP")) smCommandEstop();
  }
}

void loop() {
  if (tickDue) { tickDue = false; sampleTick(); }
  receive();
}
