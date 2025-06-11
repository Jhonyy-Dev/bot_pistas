/**
 * Script de prueba para la integración con Backblaze B2
 * Prueba directamente las funciones de descarga y envío de canciones
 */

const backblazeService = require('../src/services/backblazeService');
const backblazeController = require('../src/controllers/backblazeController');
const logger = require('../src/config/logger');
const fs = require('fs-extra');
const path = require('path');

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

// Función para simular un retraso
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función principal de prueba
async function testBackblazeIntegracion() {
  try {
    console.log(`${colors.bright}${colors.magenta}🔄 Iniciando prueba de integración con Backblaze B2...${colors.reset}`);
    
    // Paso 1: Listar archivos en el bucket
    console.log(`\n${colors.bright}${colors.yellow}📁 Paso 1: Listando archivos en el bucket de Backblaze B2${colors.reset}`);
    const archivos = await backblazeService.listarArchivos();
    
    if (!archivos || archivos.length === 0) {
      throw new Error('No se encontraron archivos en el bucket de Backblaze B2');
    }
    
    console.log(`${colors.green}✅ Se encontraron ${archivos.length} archivos en el bucket${colors.reset}`);
    
    // Mostrar los primeros 5 archivos
    console.log(`${colors.cyan}Primeros 5 archivos:${colors.reset}`);
    for (let i = 0; i < Math.min(5, archivos.length); i++) {
      console.log(`  ${colors.yellow}${i+1}. ${archivos[i].Key}${colors.reset}`);
    }
    
    // Paso 2: Seleccionar un archivo MP3 para la prueba
    const archivoMP3 = archivos.find(archivo => archivo.Key.toLowerCase().endsWith('.mp3'));
    
    if (!archivoMP3) {
      throw new Error('No se encontró ningún archivo MP3 en el bucket');
    }
    
    const nombreArchivo = archivoMP3.Key;
    console.log(`\n${colors.bright}${colors.yellow}🎵 Paso 2: Archivo MP3 seleccionado para prueba: ${nombreArchivo}${colors.reset}`);
    
    // Paso 3: Verificar si el archivo existe
    console.log(`\n${colors.bright}${colors.yellow}🔍 Paso 3: Verificando existencia del archivo${colors.reset}`);
    const existe = await backblazeService.verificarArchivoExiste(nombreArchivo);
    
    if (!existe) {
      throw new Error(`El archivo ${nombreArchivo} no existe en el bucket`);  
    }
    
    console.log(`${colors.green}✅ El archivo ${nombreArchivo} existe en el bucket${colors.reset}`);
    
    // Paso 4: Descargar el archivo
    console.log(`\n${colors.bright}${colors.yellow}⬇️ Paso 4: Descargando archivo MP3${colors.reset}`);
    console.log(`${colors.cyan}Iniciando descarga de ${nombreArchivo}...${colors.reset}`);
    
    const { buffer, rutaArchivo } = await backblazeService.descargarMp3(nombreArchivo);
    
    console.log(`${colors.green}✅ Archivo descargado correctamente${colors.reset}`);
    console.log(`${colors.cyan}Tamaño del buffer: ${buffer.length} bytes${colors.reset}`);
    console.log(`${colors.cyan}Ruta del archivo: ${rutaArchivo}${colors.reset}`);
    
    // Verificar que el archivo existe en disco
    const existeEnDisco = await fs.pathExists(rutaArchivo);
    console.log(`${colors.cyan}Archivo guardado en disco: ${existeEnDisco ? 'Sí' : 'No'}${colors.reset}`);
    
    // Paso 5: Generar URL firmada
    console.log(`\n${colors.bright}${colors.yellow}🔗 Paso 5: Generando URL firmada${colors.reset}`);
    const urlFirmada = await backblazeService.generarUrlFirmada(nombreArchivo, 60);
    
    console.log(`${colors.green}✅ URL firmada generada correctamente${colors.reset}`);
    console.log(`${colors.cyan}URL: ${urlFirmada}${colors.reset}`);
    console.log(`${colors.cyan}Expira en: 60 segundos${colors.reset}`);
    
    // Paso 6: Usar el controlador de Backblaze
    console.log(`\n${colors.bright}${colors.yellow}🎜️ Paso 6: Probando el controlador de Backblaze${colors.reset}`);
    console.log(`${colors.cyan}Descargando canción con el controlador...${colors.reset}`);
    
    const resultado = await backblazeController.descargarCancion(nombreArchivo);
    
    console.log(`${colors.green}✅ Canción descargada correctamente con el controlador${colors.reset}`);
    console.log(`${colors.cyan}Tamaño del buffer: ${resultado.buffer.length} bytes${colors.reset}`);
    console.log(`${colors.cyan}Ruta del archivo: ${resultado.rutaArchivo}${colors.reset}`);
    
    console.log(`\n${colors.bright}${colors.green}🎉 Prueba de integración con Backblaze B2 completada con éxito!${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}❌ Error en la prueba: ${error.message}${colors.reset}`);
    console.error(error);
  } finally {
    // Limpiar archivos temporales
    const tempDir = process.env.MP3_FOLDER || 'temp';
    try {
      if (await fs.pathExists(tempDir)) {
        const files = await fs.readdir(tempDir);
        for (const file of files) {
          if (file.endsWith('.mp3')) {
            await fs.unlink(path.join(tempDir, file));
            console.log(`${colors.yellow}🧹 Archivo temporal eliminado: ${file}${colors.reset}`);
          }
        }
      }
    } catch (err) {
      console.error(`${colors.red}❌ Error al limpiar archivos temporales: ${err.message}${colors.reset}`);
    }
  }
}

// Ejecutar la prueba
testBackblazeIntegracion();
