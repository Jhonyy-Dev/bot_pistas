/**
 * Script para limpiar archivos de sesión manualmente
 * Este script puede ejecutarse con: node clean-sessions.js
 */

// Importar dependencias
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

// Configurar directorio de sesiones
const SESSION_DIR = path.resolve(process.env.SESSION_FOLDER || './sessions');

// Función para limpiar sesiones
async function cleanSessions() {
  try {
    console.log('🧹 Iniciando limpieza de archivos de sesión...');
    
    // Verificar que el directorio existe
    if (!fs.existsSync(SESSION_DIR)) {
      console.log(`El directorio ${SESSION_DIR} no existe.`);
      return;
    }
    
    // Leer todos los archivos
    const files = await fs.readdir(SESSION_DIR);
    const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
    
    console.log(`Se encontraron ${sessionFiles.length} archivos de sesión.`);
    
    // Establecer cuántos archivos mantener (los más recientes)
    const maxFilesToKeep = 2; // Solo mantener los 2 más recientes
    
    if (sessionFiles.length <= maxFilesToKeep) {
      console.log('No es necesario limpiar sesiones (hay menos archivos que el máximo a mantener).');
      return;
    }
    
    // Ordenar archivos por fecha de modificación (más recientes primero)
    const fileStats = await Promise.all(
      sessionFiles.map(async file => {
        const filePath = path.join(SESSION_DIR, file);
        const stats = await fs.stat(filePath);
        return { file, filePath, mtime: stats.mtime };
      })
    );
    
    fileStats.sort((a, b) => b.mtime - a.mtime);
    
    // Mantener solo los archivos más recientes
    const filesToKeep = fileStats.slice(0, maxFilesToKeep);
    const filesToDelete = fileStats.slice(maxFilesToKeep);
    
    console.log(`Manteniendo ${filesToKeep.length} archivos más recientes:`);
    filesToKeep.forEach(f => console.log(`- ${f.file} (${f.mtime.toLocaleString()})`));
    
    console.log(`\nEliminando ${filesToDelete.length} archivos antiguos:`);
    
    // Eliminar archivos antiguos
    for (const fileInfo of filesToDelete) {
      await fs.remove(fileInfo.filePath);
      console.log(`- ${fileInfo.file} eliminado`);
    }
    
    console.log('\n✅ Limpieza de sesiones completada exitosamente.');
  } catch (error) {
    console.error(`❌ Error durante la limpieza de sesiones: ${error.message}`);
  }
}

// Ejecutar limpieza
cleanSessions().then(() => {
  console.log('Script de limpieza finalizado.');
});
