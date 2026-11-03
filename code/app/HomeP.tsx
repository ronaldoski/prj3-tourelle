import { Righteous_400Regular, useFonts } from '@expo-google-fonts/righteous';
import { Buffer } from 'buffer';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import init from 'mqtt';
import React, { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { saveHistory } from '../lib/db';

global.Buffer = Buffer;

// ===================== CONFIGURATION =====================
// A mettre dans un fichier .env a la racine du projet Expo (non versionne) :
//   EXPO_PUBLIC_BROKER_HOST=192.168.0.194
//   EXPO_PUBLIC_MQTT_USER=webapp
//   EXPO_PUBLIC_MQTT_PASS=mot_de_passe_webapp
//   EXPO_PUBLIC_OWM_KEY=cle_openweathermap
// Ces valeurs sont embarquees dans l'application : utilise un utilisateur MQTT a droits limites.
const BROKER_HOST = process.env.EXPO_PUBLIC_BROKER_HOST ?? '192.168.0.194';
const BROKER_URL = `ws://${BROKER_HOST}:9001`;          // listener WebSocket de Mosquitto
const MQTT_USER = process.env.EXPO_PUBLIC_MQTT_USER ?? 'webapp';
const MQTT_PASS = process.env.EXPO_PUBLIC_MQTT_PASS ?? '';
const OWM_KEY = process.env.EXPO_PUBLIC_OWM_KEY ?? '';

// Topics publies par l'ESP8266
const TOPIC_TIR = 'tourelle/tir';        // {"angle":95,"dist_cm":14.8,"servo_ok":true,"uptime_ms":123456}
const TOPIC_STATUS = 'tourelle/status';  // online / offline
const TOPIC_ARME = 'tourelle/arme';      // oui / non
const TOPIC_CMD = 'tourelle/cmd';        // commandes envoyees a l'ESP : armer / desarmer

export default function HomeP() {
  const [missileData, setMissileData] = useState({ angle: 0, distance: 0, time: "" });
  const [hasData, setHasData] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [espOnline, setEspOnline] = useState(false);
  const [arme, setArme] = useState<boolean | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [weather, setWeather] = useState<any>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [weatherError, setWeatherError] = useState<string>("");
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Righteous_400Regular });

  // Les callbacks MQTT sont crees une seule fois : on lit la meteo et le client via des refs,
  // sinon ils garderaient les valeurs du premier rendu (meteo toujours vide).
  const weatherRef = useRef<any>(null);
  const clientRef = useRef<any>(null);

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  const fetchWeatherData = async (lat: number, lon: number) => {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`
      );
      const data = await response.json();
      if (response.ok) {
        setWeather(data);
        setWeatherError("");
      } else {
        setWeatherError("Unable to fetch weather data");
      }
    } catch (err) {
      setWeatherError("Weather API error");
      console.log("Weather fetch error:", err);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setWeatherError('Location permission denied');
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setLocation(location);
        await fetchWeatherData(location.coords.latitude, location.coords.longitude);
      } catch (err) {
        setWeatherError('Unable to get location');
        console.log("Location error:", err);
      }
    })();
  }, []);

  useEffect(() => {
    const client = init.connect(BROKER_URL, {
      username: MQTT_USER,
      password: MQTT_PASS,
      clientId: 'expo_client_' + Math.random().toString(16).slice(2, 10),
      reconnectPeriod: 3000,
    });
    clientRef.current = client;

    client.on('connect', () => {
      setStatus("✅ Connected to MQTT broker");
      client.subscribe('tourelle/#');
    });

    client.on('reconnect', () => setStatus("Reconnecting..."));
    client.on('close', () => setStatus("Disconnected"));

    client.on('message', async (topic, message) => {
      const txt = message.toString();

      if (topic === TOPIC_STATUS) {
        setEspOnline(txt === 'online');
        return;
      }
      if (topic === TOPIC_ARME) {
        setArme(txt === 'oui');
        return;
      }
      if (topic !== TOPIC_TIR) return;

      try {
        const json = JSON.parse(txt);
        console.log("MQTT tir:", json);

        // L'ESP envoie dist_cm ; on accepte aussi l'ancien champ "distance"
        const dist = json.dist_cm ?? json.distance;
        if (json.angle === undefined || dist === undefined) return;

        setMissileData({
          angle: json.angle,
          distance: dist,
          time: new Date().toLocaleTimeString()
        });
        setHasData(true);

        // Enregistre le tir, avec la meteo si elle est deja chargee
        const w = weatherRef.current;
        try {
          await saveHistory({
            timestamp: new Date(),
            angle: json.angle,
            distance: dist,
            temperature: w?.main?.temp,
            humidity: w?.main?.humidity,
            weatherCondition: w?.weather?.[0]?.main
          });
          console.log("History saved successfully");
        } catch (dbError) {
          console.log("Error saving to database:", dbError);
        }
      } catch (e) {
        console.log("Decoding error", e);
      }
    });

    client.on('error', (err) => {
      setStatus("MQTT error");
      console.log("MQTT Error:", err);
    });

    return () => { client.end(); };
  }, []);

  const envoyer = (cmd: 'armer' | 'desarmer') => {
    clientRef.current?.publish(TOPIC_CMD, cmd);
  };

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Missile.io</Text>

      <View style={[styles.statusBadge, { backgroundColor: hasData ? '#00ff0022' : '#ff000022' }]}>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.espRow}>
        <Text style={[styles.espText, { color: espOnline ? '#00ff66' : '#ff4444' }]}>
          ESP8266 : {espOnline ? 'online' : 'offline'}
        </Text>
        <Text style={styles.espText}>
          {arme === null ? '' : arme ? 'ARMED' : 'DISARMED'}
        </Text>
      </View>

      <View style={styles.liveContainer}>
        <Text style={styles.liveTitle}>LAST DETECTION</Text>
        {hasData ? (
          <View style={styles.dataBox}>
            <View style={styles.row}>
              <Text style={styles.label}>ANGLE:</Text>
              <Text style={styles.liveData}>{missileData.angle}°</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>DIST:</Text>
              <Text style={styles.liveData}>{Number(missileData.distance).toFixed(1)} cm</Text>
            </View>
            <Text style={styles.timeText}>{missileData.time}</Text>
          </View>
        ) : (
          <Text style={styles.loadingText}>Waiting for next detection...</Text>
        )}
      </View>

      {weather && (
        <View style={styles.weatherContainer}>
          <Text style={styles.weatherTitle}>WEATHER</Text>
          <View style={styles.weatherBox}>
            <View style={styles.row}>
              <Text style={styles.label}>TEMP:</Text>
              <Text style={styles.weatherData}>{Math.round(weather.main.temp)}°C</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>COND:</Text>
              <Text style={styles.weatherData}>{weather.weather[0].main}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>HUM:</Text>
              <Text style={styles.weatherData}>{weather.main.humidity}%</Text>
            </View>
          </View>
        </View>
      )}

      {!!weatherError && (
        <View style={styles.weatherContainer}>
          <Text style={styles.weatherTitle}>WEATHER</Text>
          <Text style={styles.loadingText}>{weatherError}</Text>
        </View>
      )}

      <View style={styles.cmdRow}>
        <TouchableOpacity style={styles.cmdButton} onPress={() => envoyer('armer')}>
          <Text style={styles.cmdButtonText}>ARM</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.cmdButton, styles.cmdButtonGrey]} onPress={() => envoyer('desarmer')}>
          <Text style={styles.cmdButtonText}>DISARM</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => router.push('/Historic')}>
        <Text style={styles.buttonText}>VIEW HISTORY</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.rulesButton} onPress={() => setShowRules(true)}>
        <Text style={styles.rulesButtonText}>RULES</Text>
      </TouchableOpacity>

      <Modal
        visible={showRules}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRules(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Project Rules</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>
                <Text style={styles.boldText}>Project Overview:</Text>{"\n\n"}
                This application is designed to monitor missile trajectory data in real-time using an ESP8266 and an MQTT broker.
                {"\n\n"}
                <Text style={styles.boldText}>How it works:</Text>{"\n\n"}
                1. The application connects to the MQTT broker via WebSocket protocol{"\n"}
                2. It subscribes to the turret topics to receive detections published by the ESP8266{"\n"}
                3. When data is received, it displays the angle and distance of the detected missile{"\n"}
                4. The ARM / DISARM buttons send a command to the turret{"\n"}
                5. All data is processed and can be viewed in the history section{"\n\n"}

              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowRules(false)}>
              <Text style={styles.closeButtonText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f", alignItems: "center", justifyContent: "center", padding: 25 },
  title: { fontSize: 52, color: "#ff0000", fontFamily: 'Righteous_400Regular', textShadowColor: 'rgba(255, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  statusBadge: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, marginBottom: 15 },
  statusText: { color: "#fff", fontSize: 12, fontWeight: 'bold' },
  espRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  espText: { color: '#aaa', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  liveContainer: { width: "100%", backgroundColor: "#1a1a1a", borderRadius: 15, padding: 25, borderLeftWidth: 5, borderLeftColor: "#ff0000" },
  liveTitle: { color: "#888", fontSize: 12, letterSpacing: 2, marginBottom: 15 },
  dataBox: { width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginVertical: 5 },
  label: { color: '#444', fontSize: 18, fontWeight: 'bold' },
  liveData: { fontSize: 40, color: "#fff", fontWeight: "900" },
  timeText: { color: "#ff0000", marginTop: 20, fontSize: 12, textAlign: 'right', opacity: 0.7 },
  loadingText: { color: "#444", fontStyle: "italic", textAlign: 'center' },
  weatherContainer: { width: "100%", backgroundColor: "#1a1a1a", borderRadius: 15, padding: 25, marginTop: 20, borderLeftWidth: 5, borderLeftColor: "#00aaff" },
  weatherTitle: { color: "#888", fontSize: 12, letterSpacing: 2, marginBottom: 15 },
  weatherBox: { width: '100%' },
  weatherData: { fontSize: 24, color: "#00aaff", fontWeight: "900" },
  cmdRow: { flexDirection: 'row', width: '100%', gap: 10, marginTop: 30 },
  cmdButton: { flex: 1, backgroundColor: "#0a7d3a", padding: 14, borderRadius: 8, alignItems: "center" },
  cmdButtonGrey: { backgroundColor: "#333" },
  cmdButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", letterSpacing: 1 },
  button: { backgroundColor: "#ff0000", padding: 18, borderRadius: 8, marginTop: 20, width: "100%", alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold", letterSpacing: 1 },
  rulesButton: { backgroundColor: "#333", padding: 15, borderRadius: 8, marginTop: 15, width: "100%", alignItems: "center", borderWidth: 1, borderColor: "#666" },
  rulesButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1a1a1a', borderRadius: 15, padding: 25, width: '100%', maxHeight: '80%', borderWidth: 2, borderColor: '#ff0000' },
  modalTitle: { fontSize: 28, color: '#ff0000', fontWeight: 'bold', marginBottom: 20, textAlign: 'center', fontFamily: 'Righteous_400Regular' },
  modalScroll: { maxHeight: '70%' },
  modalText: { color: '#fff', fontSize: 16, lineHeight: 24 },
  boldText: { fontWeight: 'bold', color: '#ff0000' },
  closeButton: { backgroundColor: "#ff0000", padding: 15, borderRadius: 8, marginTop: 20, alignItems: "center" },
  closeButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", letterSpacing: 1 },
});
