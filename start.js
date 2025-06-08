/**
 * Script de inicio rápido para Bot Chiveros Perú
 * Este script verifica dependencias y condiciones antes de iniciar el bot
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '           Bot Chiveros Perú - Inicio');
console.log('\x1b[36m%s\x1b[0m', '==================================================');

// Verificar archivo .env
if (!fs.existsSync(path.join(__dirname, '.env'))) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: No se encontró el archivo .env');
  console.log('Por favor, ejecute primero "node install.js" para configurar el entorno.');
  process.exit(1);
}

// Verificar node_modules
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: No se encontraron módulos instalados');
  console.log('Ejecutando "npm install" automáticamente...');
  
  try {
    execSync('npm install', { stdio: 'inherit' });
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Error al instalar dependencias:', error.message);
    process.exit(1);
  }
}

// Verificar directorios necesarios
const dirs = ['mp3', 'sessions', 'logs'];
for (const dir of dirs) {
  if (!fs.existsSync(path.join(__dirname, dir))) {
    console.log(`📁 Creando directorio faltante: ${dir}`);
    fs.mkdirSync(path.join(__dirname, dir));
  }
}

console.log('\x1b[32m%s\x1b[0m', '✅ Verificaciones completadas. Iniciando Bot Chiveros Perú...');
console.log('\x1b[33m%s\x1b[0m', '⚠️ Para salir, presione Ctrl+C');

// Iniciar aplicación
const child = spawn('node', ['src/index.js'], { stdio: 'inherit' });

child.on('error', (error) => {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error al iniciar el bot:', error.message);
  process.exit(1);
});

// Manejar señal de terminación
process.on('SIGINT', () => {
  console.log('\n\x1b[33m%s\x1b[0m', '👋 Cerrando Bot Chiveros Perú...');
  child.kill('SIGINT');
  setTimeout(() => process.exit(0), 1000);
});
