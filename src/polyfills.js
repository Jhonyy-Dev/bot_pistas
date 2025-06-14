/**
 * Polyfills necesarios para Railway y otros entornos de hosting
 * Este archivo debe cargarse ANTES que cualquier dependencia de Baileys
 */

// Polyfill para crypto en entornos de hosting como Railway
if (typeof global.crypto === 'undefined') {
  try {
    global.crypto = require('crypto');
    console.log('✅ Polyfill crypto cargado correctamente');
  } catch (error) {
    console.error('❌ Error cargando polyfill crypto:', error.message);
  }
}

// Polyfill para WebCrypto API que Baileys necesita
if (typeof global.crypto?.webcrypto === 'undefined') {
  try {
    const { webcrypto } = require('crypto');
    if (global.crypto) {
      global.crypto.webcrypto = webcrypto;
    }
    console.log('✅ Polyfill webcrypto cargado correctamente');
  } catch (error) {
    console.error('❌ Error cargando polyfill webcrypto:', error.message);
  }
}

// Asegurar que crypto esté disponible globalmente
if (typeof globalThis.crypto === 'undefined') {
  try {
    globalThis.crypto = global.crypto;
    console.log('✅ Crypto asignado a globalThis correctamente');
  } catch (error) {
    console.error('❌ Error asignando crypto a globalThis:', error.message);
  }
}

// Verificar que todo esté funcionando
if (global.crypto && global.crypto.webcrypto) {
  console.log('🎉 Todos los polyfills de crypto están funcionando correctamente');
} else {
  console.error('⚠️ Algunos polyfills de crypto pueden no estar funcionando');
}

module.exports = {
  cryptoLoaded: !!global.crypto,
  webcryptoLoaded: !!global.crypto?.webcrypto
};
