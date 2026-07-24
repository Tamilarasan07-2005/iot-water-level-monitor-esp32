/**
 * ============================================================
 *  ESP32-S3 + EC200U LTE Modem — Water Level Monitor
 *  Sends distance, level %, and volume to ThingsBoard via MQTT
 * ============================================================
 *
 *  Hardware
 *  ─────────────────────────────────────────────────
 *  HC-SR04 Ultrasonic Sensor
 *    TRIG  → GPIO 4
 *    ECHO  → GPIO 5
 *    VCC   → 5 V
 *    GND   → GND
 *
 *  EC200U LTE Modem (7SEMI board)
 *    RX    → GPIO 13  (ESP32 TX2)
 *    TX    → GPIO 12  (ESP32 RX2)
 *
 *  ─────────────────────────────────────────────────
 *  CONFIGURATION — edit the values below before flashing
 * ============================================================
 */

#include <HardwareSerial.h>

// ── PIN DEFINITIONS ──────────────────────────────────────────
#define TRIG_PIN  4
#define ECHO_PIN  5

HardwareSerial ecSerial(2); // UART2: RX=GPIO12, TX=GPIO13

// ── SENSOR SETTINGS ──────────────────────────────────────────
#define SOUND_SPEED    0.0343f  // cm/µs at ~20 °C
#define NUM_SAMPLES    5        // readings per median filter pass

// ── TANK PARAMETERS (edit for your tank) ─────────────────────
#define TANK_HEIGHT    28.7f   // cm — distance from sensor face to empty tank bottom
#define TANK_DIAMETER  30.0f   // cm — inner diameter of cylindrical tank

// ── MOBILE APN (change for your SIM carrier) ─────────────────
// Airtel:   "airtelgprs.com"
// Jio:      "jionet"
// BSNL:     "bsnlnet"
const char* APN = "airtelgprs.com";

// ── THINGSBOARD MQTT ──────────────────────────────────────────
// Server:  EU cloud  (change to "mqtt.thingsboard.cloud" for global cloud
//          or your self-hosted IP for a private server)
const char* TB_HOST      = "mqtt.eu.thingsboard.cloud";
const int   TB_PORT      = 1883;
const char* TB_TOKEN     = "YOUR_THINGSBOARD_DEVICE_TOKEN"; // ← Device Access Token
const char* TB_CLIENT_ID = "esp32_water_tank_01";
const char* TB_TOPIC     = "v1/devices/me/telemetry";  // fixed — do NOT change

// ── EMA FILTER ───────────────────────────────────────────────
float filteredDistance    = -1.0f;  // -1 = not yet initialised
float alpha               = 0.15f;  // smoothing factor (0 = no update, 1 = no smoothing)
#define OUTLIER_THRESHOLD  8.0f     // cm — readings more than this from EMA are rejected
#define STUCK_RESET_COUNT  15       // consecutive rejections before EMA reset

int rejectedCount = 0;

// ── STATE ─────────────────────────────────────────────────────
bool mqttConnected = false;

// ── TIMING ───────────────────────────────────────────────────
unsigned long lastPublishTime = 0;
const unsigned long PUBLISH_INTERVAL = 5000; // ms between ThingsBoard publishes

// =============================================================
//  MODEM HELPER — reads until keyword or timeout
//  yield() prevents watchdog resets during long waits
// =============================================================
String waitForResponse(const String& keyword, int timeout = 10000) {
  long start = millis();
  String response = "";
  while (millis() - start < timeout) {
    while (ecSerial.available()) {
      response += (char)ecSerial.read();
    }
    if (response.indexOf(keyword) != -1) break;
    yield();
    delay(1);
  }
  Serial.println("[MODEM] " + response);
  return response;
}

// =============================================================
//  MEDIAN FILTER — takes NUM_SAMPLES readings, returns median
//  Rejects readings <= 1 cm or >= 400 cm as invalid
// =============================================================
float getDistanceCM() {
  float readings[NUM_SAMPLES];

  for (int i = 0; i < NUM_SAMPLES; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    // Timeout = 30 ms → max range ~515 cm (well beyond any water tank)
    long duration = pulseIn(ECHO_PIN, HIGH, 30000);

    if (duration > 0) {
      float d = duration * SOUND_SPEED / 2.0f;
      readings[i] = (d > 1.0f && d < 400.0f) ? d : 999.0f;
    } else {
      readings[i] = 999.0f;  // no echo received
    }
    delay(10);
  }

  // Bubble-sort ascending
  for (int i = 0; i < NUM_SAMPLES - 1; i++)
    for (int j = i + 1; j < NUM_SAMPLES; j++)
      if (readings[j] < readings[i]) {
        float tmp  = readings[i];
        readings[i] = readings[j];
        readings[j] = tmp;
      }

  return readings[NUM_SAMPLES / 2]; // median element
}

// =============================================================
//  EMA (Exponential Moving Average) FILTER
//
//  Fix 1: Only initialise with a reading within physical tank bounds.
//  Fix 2: Outlier threshold widened to 8 cm to handle real-world noise.
//  Fix 3: Stuck detector — if EMA rejects 15 readings in a row,
//          it resets so it can re-initialise from a new valid reading.
// =============================================================
float applyEMA(float newValue) {

  // First-run initialisation
  if (filteredDistance < 0) {
    if (newValue > 1.0f && newValue <= TANK_HEIGHT) {
      filteredDistance = newValue;
      rejectedCount    = 0;
      Serial.printf("[EMA] Initialized: %.2f cm\n", filteredDistance);
    } else {
      Serial.printf("[EMA] Init skipped — %.2f cm out of tank range (1–%.1f)\n",
                    newValue, (float)TANK_HEIGHT);
    }
    return filteredDistance;
  }

  // Outlier rejection + stuck detector
  if (fabsf(newValue - filteredDistance) > OUTLIER_THRESHOLD) {
    rejectedCount++;
    Serial.printf("[EMA] Outlier rejected: %.2f cm  filtered=%.2f  [%d/%d]\n",
                  newValue, filteredDistance, rejectedCount, STUCK_RESET_COUNT);

    if (rejectedCount >= STUCK_RESET_COUNT) {
      Serial.println("[EMA] Filter stuck — resetting");
      filteredDistance = -1.0f;
      rejectedCount    = 0;
    }
    return filteredDistance;
  }

  // Normal EMA update
  rejectedCount    = 0;
  filteredDistance = alpha * newValue + (1.0f - alpha) * filteredDistance;
  return filteredDistance;
}

// =============================================================
//  CALCULATIONS
// =============================================================
float calcWaterLevel(float distance) {
  float waterHeight = TANK_HEIGHT - distance;
  if (waterHeight < 0) waterHeight = 0;
  return constrain((waterHeight / TANK_HEIGHT) * 100.0f, 0.0f, 100.0f);
}

float calcVolumeLiters(float distance) {
  float waterHeight = TANK_HEIGHT - distance;
  if (waterHeight < 0) waterHeight = 0;
  float radius = TANK_DIAMETER / 2.0f;
  return (3.14159f * radius * radius * waterHeight) / 1000.0f; // cm³ → litres
}

// =============================================================
//  LTE INITIALISATION — EC200U AT-command sequence
//  Checks PDP context before activating to avoid double-activate error
// =============================================================
bool initLTE() {
  Serial.println("[LTE] Initializing...");

  ecSerial.println("AT");
  waitForResponse("OK");

  ecSerial.println("ATE0");   // echo off
  waitForResponse("OK");

  // Check SIM card
  ecSerial.println("AT+CPIN?");
  if (waitForResponse("READY", 5000).indexOf("READY") == -1) {
    Serial.println("[LTE] SIM not ready");
    return false;
  }

  // Check signal quality
  ecSerial.println("AT+CSQ");
  waitForResponse("OK");

  // Wait for network registration (up to 30 s)
  bool registered = false;
  for (int i = 0; i < 10; i++) {
    ecSerial.println("AT+CEREG?");
    String reg = waitForResponse("OK");
    // ,1 = registered home, ,5 = registered roaming
    if (reg.indexOf(",1") != -1 || reg.indexOf(",5") != -1) {
      registered = true;
      Serial.println("[LTE] Network registered");
      break;
    }
    Serial.printf("[LTE] Waiting for registration... (%d/10)\n", i + 1);
    delay(3000);
  }

  if (!registered) {
    Serial.println("[LTE] Registration failed");
    return false;
  }

  // Only activate PDP if not already active (avoids ERROR response)
  ecSerial.println("AT+QIACT?");
  String actState = waitForResponse("OK", 5000);

  if (actState.indexOf("+QIACT: 1,1") != -1) {
    Serial.println("[LTE] PDP already active — skipping activation");
  } else {
    ecSerial.println("AT+QICSGP=1,1,\"" + String(APN) + "\",\"\",\"\",1");
    waitForResponse("OK");

    ecSerial.println("AT+QIACT=1");
    if (waitForResponse("OK", 15000).indexOf("OK") == -1) {
      Serial.println("[LTE] PDP activation failed");
      return false;
    }
    Serial.println("[LTE] PDP activated");
  }

  Serial.println("[LTE] Connected");
  return true;
}

// =============================================================
//  MQTT INITIALISATION — connect to ThingsBoard
//  Token is sent as MQTT username; password is empty (ThingsBoard rule)
// =============================================================
bool initMQTT() {
  Serial.println("[MQTT] Connecting to ThingsBoard...");

  // Close any stale session first (ignore errors — session may not exist)
  ecSerial.println("AT+QMTDISC=0");
  waitForResponse("OK", 3000);
  delay(300);

  ecSerial.println("AT+QMTCLOSE=0");
  waitForResponse("OK", 3000);
  delay(1000);

  // Open TCP connection to ThingsBoard MQTT broker
  ecSerial.println("AT+QMTOPEN=0,\"" + String(TB_HOST) + "\"," + String(TB_PORT));
  if (waitForResponse("+QMTOPEN:", 15000).indexOf("+QMTOPEN: 0,0") == -1) {
    Serial.println("[MQTT] Open failed");
    return false;
  }
  delay(500);

  // Connect: clientId, username=token, password=""
  String connCmd = "AT+QMTCONN=0,\"" + String(TB_CLIENT_ID) +
                   "\",\"" + String(TB_TOKEN) + "\",\"\"";
  ecSerial.println(connCmd);

  if (waitForResponse("+QMTCONN:", 10000).indexOf("+QMTCONN: 0,0,0") != -1) {
    Serial.println("[MQTT] Connected to ThingsBoard");
    mqttConnected = true;
    return true;
  }

  Serial.println("[MQTT] Connection failed");
  return false;
}

// =============================================================
//  PUBLISH TELEMETRY — sends JSON to ThingsBoard telemetry topic
//  QoS=1 ensures at-least-once delivery
// =============================================================
bool publishTelemetry(float distance, float level, float volume) {
  if (!mqttConnected) return false;

  // ThingsBoard JSON format: {"key":value, ...}
  String payload = "{";
  payload += "\"distance_cm\":"   + String(distance, 2) + ",";
  payload += "\"level_percent\":" + String(level, 1)    + ",";
  payload += "\"volume_liters\":" + String(volume, 1);
  payload += "}";

  // AT+QMTPUB=<idx>,<msgId>,<QoS>,<retain>,"<topic>"
  ecSerial.println("AT+QMTPUB=0,1,0,0,\"" + String(TB_TOPIC) + "\"");

  if (waitForResponse(">", 3000).indexOf(">") == -1) {
    Serial.println("[MQTT] Publish prompt timeout");
    mqttConnected = false;
    return false;
  }

  ecSerial.print(payload);
  ecSerial.write(0x1A); // Ctrl-Z signals end of payload to modem

  if (waitForResponse("+QMTPUB:", 3000).indexOf("+QMTPUB: 0,") != -1) {
    Serial.println("[MQTT] Published → " + payload);
    return true;
  }

  Serial.println("[MQTT] Publish ACK timeout");
  mqttConnected = false;
  return false;
}

// =============================================================
//  SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // UART2 for EC200U modem  (RX=GPIO12, TX=GPIO13)
  ecSerial.begin(115200, SERIAL_8N1, 12, 13);

  delay(5000); // allow modem to boot

  if (initLTE()) {
    initMQTT();
  }
}

// =============================================================
//  LOOP
// =============================================================
void loop() {

  // 1 ── Read sensor and update EMA continuously
  float raw = getDistanceCM();
  if (raw < 999.0f && raw > 1.0f) {
    applyEMA(raw);
  } else {
    Serial.println("[SENSOR] No valid echo");
  }

  // 2 ── Auto-reconnect if MQTT dropped
  if (!mqttConnected) {
    Serial.println("[MQTT] Disconnected — reconnecting...");
    initMQTT();
    return; // give modem time before next sensor read
  }

  // 3 ── Publish on timed interval (only when EMA is valid)
  unsigned long now = millis();
  if (now - lastPublishTime >= PUBLISH_INTERVAL) {
    lastPublishTime = now;

    if (filteredDistance > 1.0f && filteredDistance <= TANK_HEIGHT) {
      float level  = calcWaterLevel(filteredDistance);
      float volume = calcVolumeLiters(filteredDistance);

      Serial.printf("[DATA] Dist: %.2f cm | Level: %.1f%% | Vol: %.1f L\n",
                    filteredDistance, level, volume);

      publishTelemetry(filteredDistance, level, volume);
    } else {
      Serial.printf("[SKIP] EMA=%.2f — not ready or out of range\n",
                    filteredDistance);
    }
  }

  delay(200);
}
