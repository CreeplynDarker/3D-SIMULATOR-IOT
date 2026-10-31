// state_machine.cpp — protection state machine (reference for reading; mirrors src/firmware/stateMachine.ts, §7.4).
// The laptop sends a verdict per window; the ESP32 owns persistence, local limits and the relay.
#include <Arduino.h>

enum class State : uint8_t { OFF, CALIBRATING, STARTING, NORMAL, WARNING, CRITICAL };
enum class Reason : uint8_t { NONE, RCF, I_MAX, T_MAX, STALL, ESTOP, I_SOFT, T_SOFT, SENSOR };

static constexpr int N_CRITICAL = 5;      // consecutive alert verdicts that trip
static constexpr int N_CLEAR = 3;         // consecutive clear verdicts that return to NORMAL
static constexpr float RESET_MAX_RPM = 100.0f;

void relayOn();
void relayOff();
void logLine(const char *level, const char *module, const char *fmt, ...);
void startCalibration();

struct Fsm {
  State state = State::OFF;
  int alertRun = 0, clearRun = 0;
  Reason tripReason = Reason::NONE, warnReason = Reason::NONE;
  bool linkLost = false, softActive = false;
  float rpm = 0.0f;
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

// Trip: relay off in the same tick, latch the reason, log ERR. Only RESET (with the fan stopped) leaves CRITICAL.
static void trip(Reason reason) {
  relayOff();
  fsm.tripReason = reason;
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
  if (fsm.rpm < RESET_MAX_RPM) {  // @map sm.reset.ok
    fsm = Fsm{};  // clears trip reason, flags and counters; relay is already off
  } else {  // @map sm.reset.refused
    logLine("WARN", "fsm", "reset refused: fan still turning");
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

// Local limits at a window end (§7.3). STALL is not checked while the fan is still spinning up.
void smLimitTrip(Reason reason) {
  const bool running = fsm.state == State::STARTING || fsm.state == State::NORMAL || fsm.state == State::WARNING;
  const bool supervised = fsm.state == State::NORMAL || fsm.state == State::WARNING;
  if (reason == Reason::I_MAX && running) trip(Reason::I_MAX);  // @map sm.limit.imax
  else if (reason == Reason::T_MAX && running) trip(Reason::T_MAX);  // @map sm.limit.tmax
  else if (reason == Reason::STALL && supervised) trip(Reason::STALL);  // @map sm.limit.stall
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
