# Missile.io — app Expo

App de supervision de la tourelle (Expo SDK 57, React Native 0.86, expo-router).

- `app/HomeP.tsx` : connexion MQTT en WebSocket, dernière détection, météo OpenWeatherMap, boutons ARM / DISARM
- `app/Historic.tsx` : graphes angle / distance / température, liste des enregistrements, export CSV
- `lib/db.ts` : historique dans SQLite (expo-sqlite), requêtes et export CSV
- `metro.config.js` : support `.wasm` et en-têtes COOP/COEP pour expo-sqlite sur le web

Installation et configuration : voir le [README principal](../README.md).
