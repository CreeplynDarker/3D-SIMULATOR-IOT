// relay.cpp — relay CH2 driver (reference for reading; mirrors src/firmware/stateMachine.ts relayOn/relayOff).
// 2-channel optocoupler module, JQC-3FF-S-Z 5 V coils, low-level trigger: IN2 LOW = coil on = NO2 closed.
// The fan is wired on NO2, so a reset, a crash or a floating pin leaves the fan unpowered (fail-safe).
#include <Arduino.h>

static constexpr uint8_t PIN_RELAY_IN2 = 26;  // GPIO26 -> IN2

static bool relayEnergised = false;

// Call first in setup(): drive the pin HIGH before switching it to output so the coil never pulses at boot.
void relayInit() {
  digitalWrite(PIN_RELAY_IN2, HIGH);
  pinMode(PIN_RELAY_IN2, OUTPUT);
  relayEnergised = false;
}

void relayOn() {
  digitalWrite(PIN_RELAY_IN2, LOW);  // @map relay.on
  relayEnergised = true;
}

void relayOff() {
  digitalWrite(PIN_RELAY_IN2, HIGH);  // @map relay.off
  relayEnergised = false;
}

bool relayIsOn() { return relayEnergised; }
