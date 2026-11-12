// state_machine.cpp — protection state machine (reference for reading; mirrors src/firmware/stateMachine.ts, §7.4).
// The laptop sends a verdict per window; the ESP32 owns persistence, local limits and the relay.
#include <Arduino.h>

enum class State : uint8_t { OFF, CALIBRATING, STARTING, NORMAL, WARNING, CRITICAL };
enum class Reason : uint8_t { NONE, RCF, I_MAX, T_MAX, ESTOP, I_SOFT, T_SOFT, SENSOR };

static constexpr int N_CRITICAL = 5;      // consecutive alert verdicts that trip
static constexpr int N_CLEAR = 3;         // consecutive clear verdicts that return to NORMAL
// No speed sensor on the bench (D-078): RESET waits this long after the trip so the fan has coasted to a stop.
static constexpr uint32_t RESET_MIN_DELAY_MS = 15000;

void relayOn();
void relayOff();
void logLine(const char *level, const char *module, const char *fmt, ...);
void startCalibration();
uint32_t firmwareMs();

struct Fsm {
  State state = State::OFF;
  int alertRun = 0, clearRun = 0;
  Reason tripReason = Reason::NONE, warnReason = Reason::NONE;
  bool linkLost = false, softActive = false;
  uint32_t trippedAtMs = 0;  // firmware clock at the last trip
};
Fsm fsm;

static const char *name(State s) {
  static const char *names[] = {"OFF", "CALIBRATING", "STARTING", "NORMAL", "WARNING", "CRITICAL"};
  return names[(int)s];
}

static void enter(State next) {
  logLine("INFO", "fsm", "%s -> %s", name(fsm.state), name(next));
  fsm.state = next;
}

// Trip: relay off in the same tick, latch the reason and the time, log ERR. Only RESET (RESET_MIN_DELAY_MS after
// the trip) leaves CRITICAL.
static void trip(Reason reason) {
  relayOff();
  fsm.tripReason = reason;
  fsm.trippedAtMs = firmwareMs();
  enter(State::CRITICAL);
  logLine("ERR", "fsm", "trip %d", (int)reason);
}

void smCommandStart() {
  if (fsm.state == State::OFF) {  // @map sm.off.start
    fsm.alertRun = fsm.clearRun = 0;
    enter(State::CALIBRATING);
    startCalibration();
  } else if (fsm.state == State::CRITICAL) {  // @map sm.start.refused
    logLine("ERR", "fsm", "start refused: latched");
  }
}

void smCommandEstop() {
  if (fsm.state != State::OFF) trip(Reason::ESTOP);  // @map sm.estop
}

void smCommandReset() {
  if (fsm.state != State::CRITICAL) return;
  if (firmwareMs() - fsm.trippedAtMs >= RESET_MIN_DELAY_MS) {  // @map sm.reset.ok
    fsm = Fsm{};  // clears trip reason, trip time, flags and counters; relay is already off
  } else {  // @map sm.reset.refused
    logLine("WARN", "fsm", "reset refused: wait %u s after the trip", (unsigned)(RESET_MIN_DELAY_MS / 1000));
  }
}

void smCalibrationDone() {
  if (fsm.state != State::CALIBRATING) return;
  relayOn();  // GPIO26 LOW: the fan gets 12 V through NO2
  enter(State::STARTING);  // @map sm.calib.done
}

void smGraceDone() {
  if (fsm.state != State::STARTING) return;
  fsm.alertRun = fsm.clearRun = 0;
  enter(State::NORMAL);  // @map sm.start.done
}

// Local limits at a window end (§7.3).
void smLimitTrip(Reason reason) {
  const bool running = fsm.state == State::STARTING || fsm.state == State::NORMAL || fsm.state == State::WARNING;
  if (reason == Reason::I_MAX && running) trip(Reason::I_MAX);  // @map sm.limit.imax
  else if (reason == Reason::T_MAX && running) trip(Reason::T_MAX);  // @map sm.limit.tmax
}

void smSoftCondition(Reason reason) {
  if (fsm.state != State::NORMAL) return;
  fsm.warnReason = reason;
  enter(State::WARNING);  // @map sm.normal.soft
}

// RCF verdicts, event-driven. Ignored outside NORMAL and WARNING (STARTING included). A dropped verdict never
// arrives, so it leaves alertRun unchanged.
void smVerdict(bool alert, bool clear) {
  if (fsm.state != State::NORMAL && fsm.state != State::WARNING) return;
  fsm.alertRun = alert ? fsm.alertRun + 1 : 0;
  fsm.clearRun = (clear && !fsm.softActive) ? fsm.clearRun + 1 : 0;

  if (fsm.state == State::NORMAL) {
    if (alert && !fsm.linkLost) {  // @map sm.normal.alert
      fsm.alertRun = 1;
      fsm.warnReason = Reason::RCF;
      enter(State::WARNING);
    }
    return;
  }
  if (alert && fsm.alertRun >= N_CRITICAL) {  // @map sm.warn.trip
    trip(Reason::RCF);
  } else if (alert) {  // @map sm.warn.alert
    logLine("INFO", "fsm", "alert %d/%d", fsm.alertRun, N_CRITICAL);
  } else if (clear && fsm.clearRun >= N_CLEAR) {  // @map sm.warn.clear
    fsm.warnReason = Reason::NONE;
    enter(State::NORMAL);
  }
}
