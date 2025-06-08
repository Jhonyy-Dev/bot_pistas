/**
 * Utilidad para limpiar archivos de sesión antiguos
 * Previene la saturación de almacenamiento por archivos de sesión de Baileys
 */
const fs = require('fs-extra');
const path = require('path');
const logger = require('../config/logger');

class SessionCleaner {
  /**
   * Constructor
   * @param {string} sessionDir - Directorio de sesiones
   * @param {number} maxFilesToKeep - Número máximo de archivos de sesión a mantener
   * @param {number} cleanIntervalHours - Intervalo de limpieza en horas
   */
  constructor(sessionDir, maxFilesToKeep = 5, cleanIntervalHours = 24) {
    this.sessionDir = sessionDir;
    this.maxFilesToKeep = maxFilesToKeep;
    this.cleanIntervalMs = cleanIntervalHours * 60 * 60 * 1000;
    this.intervalId = null;
  }

  /**
   * Inicia el proceso de limpieza periódica
   */
  start() {
    logger.info('Iniciando servicio de limpieza de sesiones');
    
    // Ejecutar inmediatamente la primera limpieza
    this.cleanSessions();
    
    // Programar limpiezas periódicas
    this.intervalId = setInterval(() => {
      this.cleanSessions();
    }, this.cleanIntervalMs);
    
    logger.info(`Limpieza de sesiones programada cada ${this.cleanIntervalMs / (60 * 60 * 1000)} horas`);
  }

  /**
   * Detiene el proceso de limpieza periódica
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Servicio de limpieza de sesiones detenido');
    }
  }

  /**
   * Limpia los archivos de sesión antiguos
   */
  async cleanSessions() {
    try {
      logger.info('Iniciando limpieza de archivos de sesión...');
      
      // Leer archivos de sesión
      const files = await fs.readdir(this.sessionDir);
      const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
      
      // Si hay menos archivos que el máximo a mantener, no hacer nada
      if (sessionFiles.length <= this.maxFilesToKeep) {
        logger.info(`No se requiere limpieza. Hay ${sessionFiles.length} archivos de sesión (máximo: ${this.maxFilesToKeep})`);
        return;
      }
      
      // Ordenar archivos por fecha de modificación (más recientes primero)
      const fileStats = await Promise.all(
        sessionFiles.map(async file => {
          const filePath = path.join(this.sessionDir, file);
          const stats = await fs.stat(filePath);
          return { file, filePath, mtime: stats.mtime };
        })
      );
      
      fileStats.sort((a, b) => b.mtime - a.mtime);
      
      // Mantener solo los archivos más recientes
      const filesToKeep = fileStats.slice(0, this.maxFilesToKeep);
      const filesToDelete = fileStats.slice(this.maxFilesToKeep);
      
      // Eliminar archivos antiguos
      for (const fileInfo of filesToDelete) {
        await fs.remove(fileInfo.filePath);
        logger.debug(`Archivo de sesión eliminado: ${fileInfo.file}`);
      }
      
      logger.info(`Limpieza completada. Se eliminaron ${filesToDelete.length} archivos de sesión antiguos.`);
    } catch (error) {
      logger.error(`Error durante la limpieza de sesiones: ${error.message}`);
    }
  }
  
  /**
   * Ejecuta una limpieza manual una sola vez
   */
  async cleanSessionsNow() {
    await this.cleanSessions();
  }
}

module.exports = SessionCleaner;
