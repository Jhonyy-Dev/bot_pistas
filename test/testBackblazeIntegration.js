/**
 * Script de prueba para la integración completa de Backblaze B2 con el bot
 * Este script simula una búsqueda y descarga de una canción desde Backblaze B2
 */

const backblazeController = require('../src/controllers/backblazeController');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../src/config/logger');

// Configurar colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

// Función principal de prueba
async function testBackblazeIntegration() {
  try {
    console.log(`${colors.bright}${colors.blue}🔄 Iniciando prueba de integración con Backblaze B2...${colors.reset}`);
    
    // Término de búsqueda para la prueba
    const searchTerm = 'centella';
    console.log(`${colors.cyan}🔍 Buscando canciones con término: "${searchTerm}"${colors.reset}`);
    
    // Buscar canciones
    const canciones = await backblazeController.buscarCanciones(searchTerm, 10);
    
    if (canciones.length === 0) {
      console.log(`${colors.red}❌ No se encontraron canciones que coincidan con "${searchTerm}"${colors.reset}`);
      return;
    }
    
    console.log(`${colors.green}✅ Se encontraron ${canciones.length} canciones${colors.reset}`);
    
    // Mostrar las canciones encontradas
    console.log(`${colors.bright}${colors.magenta}📋 Canciones encontradas:${colors.reset}`);
    canciones.forEach((cancion, index) => {
      console.log(`${colors.yellow}${index + 1}. ${cancion.nombre} - ${cancion.artista} ${cancion.es_backblaze ? '(Backblaze B2)' : '(Local)'}${colors.reset}`);
    });
    
    // Seleccionar la primera canción para descargar
    const cancionSeleccionada = canciones[0];
    console.log(`\n${colors.bright}${colors.blue}📥 Descargando canción: "${cancionSeleccionada.nombre}"${colors.reset}`);
    
    // Descargar la canción
    const { buffer, rutaArchivo } = await backblazeController.descargarCancion(cancionSeleccionada.archivo_nombre);
    
    console.log(`${colors.green}✅ Canción descargada correctamente${colors.reset}`);
    console.log(`${colors.cyan}📁 Ruta del archivo: ${rutaArchivo}${colors.reset}`);
    console.log(`${colors.cyan}📊 Tamaño del buffer: ${buffer.length} bytes${colors.reset}`);
    
    // Registrar reproducción
    console.log(`\n${colors.bright}${colors.blue}📊 Registrando reproducción...${colors.reset}`);
    await backblazeController.registrarReproduccion(cancionSeleccionada, 'test_user');
    
    console.log(`${colors.green}✅ Reproducción registrada correctamente${colors.reset}`);
    
    // Limpiar archivos temporales después de 5 segundos
    console.log(`\n${colors.bright}${colors.yellow}🧹 Limpiando archivos temporales en 5 segundos...${colors.reset}`);
    
    setTimeout(async () => {
      try {
        if (fs.existsSync(rutaArchivo)) {
          fs.unlinkSync(rutaArchivo);
          console.log(`${colors.green}✅ Archivo temporal eliminado: ${rutaArchivo}${colors.reset}`);
        }
      } catch (cleanupError) {
        console.error(`${colors.red}❌ Error al limpiar archivo temporal: ${cleanupError.message}${colors.reset}`);
      }
      
      console.log(`\n${colors.bright}${colors.green}🎉 Prueba completada con éxito!${colors.reset}`);
    }, 5000);
    
  } catch (error) {
    console.error(`${colors.red}❌ Error en la prueba: ${error.message}${colors.reset}`);
    console.error(error);
  }
}

// Ejecutar la prueba
testBackblazeIntegration();
