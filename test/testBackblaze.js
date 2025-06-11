/**
 * Script de prueba para verificar la integración con Backblaze B2
 * Ejecutar con: node test/testBackblaze.js
 */

require('dotenv').config();
const backblazeService = require('../src/services/backblazeService');
const fs = require('fs');
const path = require('path');

// Nombre del archivo a probar (el que ya subiste a Backblaze)
const ARCHIVO_PRUEBA = 'centella - mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3';

/**
 * Función principal de prueba
 */
async function ejecutarPruebas() {
  console.log('🔄 Iniciando pruebas de integración con Backblaze B2...');
  
  try {
    // 1. Verificar que el archivo existe en Backblaze B2
    console.log('\n🔍 Verificando archivo en Backblaze B2...');
    const archivoExiste = await backblazeService.verificarArchivoExiste(ARCHIVO_PRUEBA);
    
    if (!archivoExiste) {
      throw new Error(`❌ El archivo ${ARCHIVO_PRUEBA} no existe en Backblaze B2`);
    }
    
    console.log(`✅ Archivo "${ARCHIVO_PRUEBA}" encontrado en Backblaze B2`);
    
    // 2. Obtener información del archivo
    console.log('\n📋 Obteniendo información del archivo...');
    const infoArchivo = await backblazeService.obtenerInfoArchivo(ARCHIVO_PRUEBA);
    console.log('Información del archivo:');
    console.log(`- Tamaño: ${(infoArchivo.tamanio / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`- Tipo: ${infoArchivo.tipo}`);
    console.log(`- Última modificación: ${infoArchivo.ultimaModificacion}`);
    
    // 3. Generar URL firmada
    console.log('\n🔗 Generando URL firmada (expira en 1 hora)...');
    const urlFirmada = await backblazeService.generarUrlFirmada(ARCHIVO_PRUEBA, 3600);
    console.log(`URL firmada: ${urlFirmada}`);
    
    // 4. Descargar archivo
    console.log('\n⬇️ Descargando archivo...');
    const rutaDescargada = await backblazeService.descargarMp3(ARCHIVO_PRUEBA);
    console.log(`✅ Archivo descargado en: ${rutaDescargada}`);
    
    // Verificar tamaño del archivo descargado
    const stats = fs.statSync(rutaDescargada);
    console.log(`- Tamaño del archivo descargado: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    
    // 5. Limpiar archivo temporal
    console.log('\n🗑️ Limpiando archivo temporal...');
    fs.unlinkSync(rutaDescargada);
    console.log('✅ Archivo temporal eliminado');
    
    console.log('\n✅ Todas las pruebas completadas exitosamente');
    
  } catch (error) {
    console.error('\n❌ Error durante las pruebas:', error.message);
    console.error(error);
  } finally {
    // Finalizar proceso
    process.exit(0);
  }
}

// Ejecutar pruebas
ejecutarPruebas();
