// Config Metro — requise par expo-sqlite sur le web
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite web charge wa-sqlite.wasm : Metro doit traiter .wasm comme un asset
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (utilise par le worker SQLite) exige l'isolation cross-origin
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
