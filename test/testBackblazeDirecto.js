/**
 * Script de prueba para la integración directa con Backblaze B2
 * Este script se salta la parte de la base de datos y prueba directamente la conexión con Backblaze B2
 */

const backblazeService = require('../src/services/backblazeService');
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
async function testBackblazeDirecto() {
  try {
    console.log(`${colors.bright}${colors.blue}🔄 Iniciando prueba directa con Backblaze B2...${colors.reset}`);
    
    // Listar archivos en el bucket
    console.log(`${colors.cyan}📋 Listando archivos en el bucket...${colors.reset}`);
    const archivos = await backblazeService.listarArchivos();
    
    if (archivos.length === 0) {
      console.log(`${colors.yellow}⚠️ No se encontraron archivos en el bucket${colors.reset}`);
      return;
    }
    
    console.log(`${colors.green}✅ Se encontraron ${archivos.length} archivos${colors.reset}`);
    
    // Mostrar los archivos encontrados
    console.log(`${colors.bright}${colors.magenta}📋 Archivos encontrados:${colors.reset}`);
    archivos.forEach((archivo, index) => {
      const tamanioMB = (archivo.Size / (1024 * 1024)).toFixed(2);
      console.log(`${colors.yellow}${index + 1}. ${archivo.Key} (${tamanioMB} MB)${colors.reset}`);
    });
    
    // Seleccionar el primer archivo para descargar
    const archivoSeleccionado = archivos[0].Key;
    console.log(`\n${colors.bright}${colors.blue}📥 Descargando archivo: "${archivoSeleccionado}"${colors.reset}`);
    
    // Verificar si el archivo existe
    const existe = await backblazeService.verificarArchivoExiste(archivoSeleccionado);
    if (!existe) {
      console.log(`${colors.red}❌ El archivo no existe en Backblaze B2${colors.reset}`);
      return;
    }
    
    console.log(`${colors.green}✅ Archivo verificado, existe en el bucket${colors.reset}`);
    
    // Descargar el archivo
    const { rutaArchivo, buffer } = await backblazeService.descargarMp3(archivoSeleccionado);
    
    console.log(`${colors.green}✅ Archivo descargado correctamente${colors.reset}`);
    console.log(`${colors.cyan}📁 Ruta del archivo: ${rutaArchivo}${colors.reset}`);
    
    // Verificar que el archivo se descargó correctamente
    console.log(`${colors.cyan}📊 Tamaño del buffer: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB${colors.reset}`);
    
    // Verificar que el archivo se escribió correctamente
    const stats = await fs.stat(rutaArchivo);
    console.log(`${colors.cyan}📊 Tamaño del archivo en disco: ${(stats.size / (1024 * 1024)).toFixed(2)} MB${colors.reset}`);
    
    // Generar URL firmada
    console.log(`\n${colors.bright}${colors.blue}🔗 Generando URL firmada...${colors.reset}`);
    const urlFirmada = await backblazeService.generarUrlFirmada(archivoSeleccionado, 3600);
    
    console.log(`${colors.green}✅ URL firmada generada correctamente${colors.reset}`);
    console.log(`${colors.cyan}🌐 URL: ${urlFirmada}${colors.reset}`);
    
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
testBackblazeDirecto();
