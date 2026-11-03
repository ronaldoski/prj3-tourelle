/*
  Test MQTT isole pour ESP8266 (NodeMCU) : aucun servo, aucun capteur, aucun relais.
  Etapes testees, avec un message clair a chaque fois :
    1. WiFi 2,4 GHz
    2. connexion TCP brute vers le broker (pare-feu, IP, reseau)
    3. connexion MQTT avec identifiants
    4. publication d'un message toutes les 5 secondes

  A copier avec secrets.h dans le dossier "mqtt_test".
  Bibliotheque : PubSubClient. Moniteur serie : 115200.
*/

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include "secrets.h"     // WIFI_SSID, WIFI_PASS, MQTT_HOST, MQTT_USER, MQTT_PASS

const uint16_t BROKER_PORT = 1883;
const char* TOPIC_TEST   = "tourelle/status";   // autorise par le fichier acl pour l'utilisateur tourelle

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// Liste les reseaux 2,4 GHz vus par l'ESP (nom exact, canal, signal)
void scannerReseaux() {
  Serial.println("Reseaux 2,4 GHz visibles par l'ESP :");
  int n = WiFi.scanNetworks();
  if (n <= 0) {
    Serial.println("  aucun reseau trouve");
    return;
  }
  for (int i = 0; i < n; i++) {
    Serial.printf("  %2d) \"%s\"  canal %d  signal %d dBm  %s\n",
                  i + 1, WiFi.SSID(i).c_str(), WiFi.channel(i), WiFi.RSSI(i),
                  WiFi.encryptionType(i) == ENC_TYPE_NONE ? "ouvert" : "protege");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== TEST MQTT ===");

  mqtt.setServer(MQTT_HOST, BROKER_PORT);
  mqtt.setSocketTimeout(3);

  // WiFi plus tolerant pour l'ESP8266 (box en Wi-Fi 6, signal moyen, alim juste)
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  WiFi.setPhyMode(WIFI_PHY_MODE_11G);               // evite les soucis de negociation 802.11n / ax
  WiFi.setSleepMode(WIFI_NONE_SLEEP);               // pas de mise en veille WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("WiFi vers \"%s\" ", WIFI_SSID);
  unsigned long debut = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - debut < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("WiFi ECHEC (status=%d) : SSID, mot de passe ou reseau 5 GHz ?\n", WiFi.status());
    scannerReseaux();
    return;
  }

  Serial.printf("WiFi OK  IP ESP : %s   broker vise : %s:%u\n",
                WiFi.localIP().toString().c_str(), MQTT_HOST, BROKER_PORT);
  Serial.printf("Signal : %d dBm   canal : %d   (sous -80 dBm : trop faible)\n",
                WiFi.RSSI(), WiFi.channel());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long dernierEssaiWifi = 0;
    if (millis() - dernierEssaiWifi > 10000) {
      dernierEssaiWifi = millis();
      Serial.printf("WiFi non connecte (status=%d) -> nouvel essai\n", WiFi.status());
      WiFi.disconnect();
      delay(100);
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
    delay(500);
    return;
  }

  if (!mqtt.connected()) {
    // Etape 2 : le port 1883 du PC est-il joignable ?
    WiFiClient test;
    test.setTimeout(3000);                          // delai max de connexion
    Serial.printf("TCP vers %s:%u ... ", MQTT_HOST, BROKER_PORT);
    if (test.connect(MQTT_HOST, BROKER_PORT)) {
      Serial.println("OK");
      test.stop();
    } else {
      Serial.println("ECHEC -> pare-feu Windows, mauvaise IP du PC, ou reseau different");
      delay(3000);
      return;
    }

    // Etape 3 : identifiants MQTT
    Serial.print("MQTT connect ... ");
    if (mqtt.connect("tourelle-test", MQTT_USER, MQTT_PASS)) {
      Serial.println("OK");
    } else {
      Serial.printf("ECHEC etat=%d  (4 = identifiants faux, 5 = non autorise)\n", mqtt.state());
      delay(3000);
      return;
    }
  }

  mqtt.loop();

  // Etape 4 : publication reguliere
  static unsigned long dernier = 0;
  if (millis() - dernier > 5000) {
    dernier = millis();
    bool ok = mqtt.publish(TOPIC_TEST, "test-ping");
    Serial.printf("publish %s : %s\n", TOPIC_TEST, ok ? "OK" : "ECHEC");
  }
}
