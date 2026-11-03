/*
 
*/

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>
#include "secrets.h"

// ===================== PINS (NodeMCU) =====================
const int TRIG_PIN  = D4;   // GPIO2
const int ECHO_PIN  = D6;   // GPIO12 (3,3 V max !)
const int SERVO_PIN = D5;   // GPIO14
const int RELAY_PIN = D0;   // GPIO16
const int BUTEE_PIN = D7;   // GPIO13 : fin de course du servo (contact vers GND)
// LCD I2C : SDA = D1, SCL = D2

// ===================== REGLAGES =====================
const bool ACTIF_HAUT        = false;  // true si le relais colle avec un signal HAUT
const bool DEBUG             = true;   // affiche chaque mesure sur le port serie
const bool UTILISER_BUTEE    = false;  // true une fois le fin de course cable
const bool ARME_AU_DEMARRAGE = true;   // false : la tourelle ne tire qu'apres la commande "armer"

const float DIST_TIR_CM = 20.0;           // distance de declenchement
const float DIST_MIN_CM = 2.0;            // en dessous : mesure ignoree
const unsigned long DUREE_TIR_MS = 50;    // duree de l'impulsion sur le solenoide
const unsigned long PAUSE_TIR_MS = 2000;  // delai mini entre deux tirs
const int ANGLE_PAS = 5;                  // pas du balayage en degres

// ===================== MQTT =====================
const uint16_t BROKER_PORT = 1883;

const char* TOPIC_POSITION = "tourelle/position";  // ok / erreur (fin de course)
const char* TOPIC_ARME     = "tourelle/arme";      // oui / non
const char* TOPIC_CMD      = "tourelle/cmd";       // commandes recues : armer / desarmer

// ===================== OBJETS / ETAT =====================
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo monServo;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long dernierTir = 0;
unsigned long dernierEssaiMqtt = 0;
unsigned long dernierEssaiWifi = 0;
int  decalage = 0;                  // angle logiciel qui correspond au 0 physique
bool positionOk = true;             // false : tir interdit
bool arme = ARME_AU_DEMARRAGE;      // false : tir interdit


// ===================== RELAIS =====================
void relais(bool on) {
  digitalWrite(RELAY_PIN, (on == ACTIF_HAUT) ? HIGH : LOW);
}

void tirer() {
  relais(true);
  delay(DUREE_TIR_MS);
  relais(false);
  dernierTir = millis();
}


// ===================== LCD =====================
void afficherLigne(int ligne, const char* texte) {
  char buf[17];
  snprintf(buf, sizeof(buf), "%-16.16s", texte);   // complete / coupe a 16 caracteres
  lcd.setCursor(0, ligne);
  lcd.print(buf);
}


// ===================== ULTRASON =====================
unsigned long mesurerUs() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  return pulseIn(ECHO_PIN, HIGH, 30000);           // 0 si pas d'echo (30 ms max)
}

float mesurerCm() {
  unsigned long us = mesurerUs();
  return (us == 0) ? 0.0 : us * 0.034 / 2.0;       // 0 = pas d'echo
}

bool dansLaZone(float cm) {
  return (cm >= DIST_MIN_CM && cm < DIST_TIR_CM);
}


// ===================== SERVO + FIN DE COURSE =====================
// true si le fin de course est enfonce (contact vers GND, pull-up interne)
bool butee() {
  if (digitalRead(BUTEE_PIN) != LOW) return false;
  delay(5);                                        // anti-rebond
  return digitalRead(BUTEE_PIN) == LOW;
}

// Envoie le servo a un angle PHYSIQUE (0 = position de la butee)
void servoVers(int angle) {
  monServo.write(constrain(angle + decalage, 0, 180));
}

// Cherche la butee en descendant lentement et calibre le 0 physique
bool referencerServo() {
  afficherLigne(0, "REFERENCEMENT");
  afficherLigne(1, "servo -> butee");
  monServo.write(90);                              // depart loin de la butee
  delay(800);

  for (int a = 90; a >= 0; a--) {
    monServo.write(a);
    delay(25);                                     // 1 degre par 25 ms : le servo suit
    if (butee()) {
      decalage = a;                                // le 0 physique = angle logiciel a
      Serial.printf("Butee atteinte a %d deg logiciel -> decalage = %d\n", a, a);
      afficherLigne(1, "butee OK");
      delay(300);
      return true;
    }
  }

  decalage = 0;
  Serial.println("ERREUR : butee non trouvee");
  afficherLigne(1, "butee ABSENTE");
  delay(800);
  return false;
}


// ===================== MQTT : PUBLICATION ET COMMANDES =====================
void publier(const char* topic, const char* msg, bool retain) {
  if (mqtt.connected()) mqtt.publish(topic, msg, retain);
}

void publierTir(int angle, float cm) {
  char msg[128];
  snprintf(msg, sizeof(msg),
           "{\"angle\":%d,\"dist_cm\":%.1f,\"servo_ok\":%s,\"uptime_ms\":%lu}",
           angle, cm, positionOk ? "true" : "false", millis());
  if (DEBUG) Serial.println(msg);
  if (mqtt.connected()) mqtt.publish(TOPIC_TIR, msg);
  else Serial.println("MQTT hors ligne : tir non publie");
}

// Commandes recues sur tourelle/cmd : "armer" ou "desarmer"
void onMessage(char* topic, byte* payload, unsigned int length) {
  char msg[32];
  if (length > sizeof(msg) - 1) length = sizeof(msg) - 1;
  memcpy(msg, payload, length);
  msg[length] = 0;

  if (strcmp(msg, "armer") == 0)         arme = true;
  else if (strcmp(msg, "desarmer") == 0) arme = false;
  else {
    Serial.printf("Commande inconnue ignoree : %s\n", msg);
    return;
  }

  Serial.printf("CMD : %s -> arme = %d\n", msg, arme);
  mqtt.publish(TOPIC_ARME, arme ? "oui" : "non", true);
}


// ===================== WIFI / MQTT : CONNEXION =====================
void demarrerWifi() {
  WiFi.disconnect();
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void connecterWifi() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setPhyMode(WIFI_PHY_MODE_11G);              // evite les soucis de negociation 802.11n / ax
  WiFi.setSleepMode(WIFI_NONE_SLEEP);              // pas de mise en veille WiFi
  WiFi.setAutoReconnect(true);
  demarrerWifi();

  unsigned long debut = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - debut < 15000) delay(250);

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi OK  IP : %s  signal : %d dBm  canal : %d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI(), WiFi.channel());
  } else {
    Serial.printf("WiFi ECHEC (status=%d) : SSID, mot de passe ou reseau 5 GHz ?\n", WiFi.status());
  }
}

// A appeler souvent : reconnecte le WiFi puis MQTT sans bloquer longtemps
void maintenirMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - dernierEssaiWifi > 10000) {
      dernierEssaiWifi = millis();
      Serial.printf("WiFi perdu (status=%d) : nouvel essai\n", WiFi.status());
      demarrerWifi();
    }
    return;
  }

  if (!mqtt.connected()) {
    if (millis() - dernierEssaiMqtt < 5000) return;   // un essai toutes les 5 s
    dernierEssaiMqtt = millis();

    // derniere volonte : le broker publie "offline" si l'ESP disparait
    if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS, TOPIC_STATUS, 0, true, "offline")) {
      Serial.println("MQTT connecte");
      mqtt.subscribe(TOPIC_CMD);
      mqtt.publish(TOPIC_STATUS, "online", true);
      mqtt.publish(TOPIC_ARME, arme ? "oui" : "non", true);
      mqtt.publish(TOPIC_POSITION, positionOk ? "ok" : "erreur", true);
    } else {
      Serial.printf("MQTT echec, etat=%d  (-2 broker injoignable, 4 identifiants faux, 5 non autorise)\n",
                    mqtt.state());
    }
    return;
  }

  mqtt.loop();
}


// ===================== VERIFICATION 0 LOGICIEL = 0 PHYSIQUE =====================
// A appeler au debut de chaque balayage
void verifierPosition() {
  if (!UTILISER_BUTEE) return;

  servoVers(0);
  delay(500);                                      // laisse le servo atteindre le 0

  bool ok = butee();
  if (!ok) {
    Serial.println("0 logiciel != 0 physique : nouveau referencement");
    ok = referencerServo();
  }

  if (ok != positionOk) {
    publier(TOPIC_POSITION, ok ? "ok" : "erreur", true);
  }
  positionOk = ok;
}


// ===================== DETECTION + TIR =====================
void checkTarget(int angle) {
  maintenirMqtt();

  servoVers(angle);
  delay(100);                                      // le servo se stabilise + ecart entre mesures

  float cm = mesurerCm();
  if (DEBUG) Serial.printf("angle: %d  distance: %.1f cm\n", angle, cm);

  char l1[24];
  if (cm == 0) snprintf(l1, sizeof(l1), "A:%3d  pas d'echo", angle);
  else         snprintf(l1, sizeof(l1), "A:%3d D:%5.1fcm", angle, cm);
  afficherLigne(0, l1);

  bool cible = dansLaZone(cm);
  if (cible) {                                     // confirmation pour eviter un faux tir
    delay(60);
    cible = dansLaZone(mesurerCm());
  }

  if (!cible) {
    afficherLigne(1, arme ? "Balayage..." : "DESARME");
    return;
  }

  if (!arme) {                                     // tourelle desarmee : aucun tir
    afficherLigne(1, "DESARME");
    return;
  }

  if (!positionOk) {                               // servo non reference : tir interdit
    afficherLigne(1, "ERR POS: NO TIR");
    return;
  }

  bool tirOk = (dernierTir == 0) || (millis() - dernierTir >= PAUSE_TIR_MS);
  if (!tirOk) {
    afficherLigne(1, "Cible (attente)");
    return;
  }

  afficherLigne(1, "CIBLE ! TIR");
  Serial.printf("A%dD%d!\n", angle, (int)cm);
  tirer();
  publierTir(angle, cm);                           // apres le tir : le reseau ne le retarde jamais
  delay(200);
}


// ===================== SETUP / LOOP =====================
void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  relais(false);                                   // relais coupe des le debut

  Serial.begin(115200);
  Serial.println("\nTOURELLE : demarrage");

  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(ECHO_PIN, INPUT);
  if (UTILISER_BUTEE) pinMode(BUTEE_PIN, INPUT_PULLUP);

  Wire.begin(D1, D2);                              // SDA = D1, SCL = D2
  lcd.init();
  lcd.backlight();
  afficherLigne(0, "SYSTEME PRET");
  afficherLigne(1, "INITIALISATION");

  monServo.attach(SERVO_PIN);
  if (UTILISER_BUTEE) {
    positionOk = referencerServo();
  } else {
    monServo.write(0);
    delay(1000);
  }

  afficherLigne(0, "SYSTEME PRET");
  afficherLigne(1, "WIFI...");
  wifiClient.setTimeout(2000);                     // limite le blocage si le broker est absent
  connecterWifi();
  mqtt.setServer(MQTT_HOST, BROKER_PORT);
  mqtt.setSocketTimeout(2);
  mqtt.setCallback(onMessage);
  afficherLigne(1, WiFi.status() == WL_CONNECTED ? "WIFI OK" : "WIFI ECHEC");
  delay(500);
}

void loop() {
  verifierPosition();                              // 0 logiciel = 0 physique ?
  for (int a = 0; a <= 180; a += ANGLE_PAS)  checkTarget(a);
  for (int a = 180; a >= 0; a -= ANGLE_PAS)  checkTarget(a);
}
