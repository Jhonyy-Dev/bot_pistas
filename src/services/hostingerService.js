/**
 * Servicio para interactuar con archivos MP3 alojados en Hostinger
 * Este servicio permite listar y descargar archivos MP3 desde un hosting web
 */
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const logger = require('../config/logger');

class HostingerService {
  constructor() {
    // URL base donde están alojados los archivos MP3 en Hostinger
    this.baseUrl = 'https://srv1847-files.hstgr.io/d945b5f3ac94e2ec/files/pistas_frejol/'; // URL de la carpeta en Hostinger
    
    // Crear directorio temporal para archivos descargados
    this.tempFolder = path.resolve(os.tmpdir(), 'bot_hostinger_temp');
    fs.ensureDirSync(this.tempFolder);
    
    // Programar limpieza periódica de archivos temporales
    setInterval(() => this.cleanupTempFiles(), 30 * 60 * 1000); // Cada 30 minutos
  }

  /**
   * Descarga un archivo MP3 desde Hostinger o desde el directorio local
   * @param {string} fileName - Nombre del archivo a descargar
   * @returns {Promise<Object>} Objeto con buffer del archivo y ruta temporal
   */
  async downloadFile(fileName) {
    try {
      // Sanitizar el nombre del archivo
      const sanitizedFileName = this.sanitizeFileName(fileName);
      
      // Verificar si es la canción "PA QUE ME INVITAN"
      if (sanitizedFileName.toLowerCase().includes('pa que me invitan') || 
          sanitizedFileName.toLowerCase().includes('los 5 de oro')) {
        logger.info('Detectada canción especial "PA QUE ME INVITAN", usando versión local');
        
        // Ruta al archivo local
        const localFilePath = path.join(__dirname, '..', 'assets', 'mp3', 'PA QUE ME INVITAN - LOS 5 DE ORO.MP3');
        
        // Verificar si existe el archivo local
        if (await fs.pathExists(localFilePath)) {
          logger.info(`Usando archivo local: ${localFilePath}`);
          
          // Leer el archivo
          const fileBuffer = await fs.readFile(localFilePath);
          
          // Crear un archivo temporal para enviarlo
          const tempFilePath = path.join(this.tempFolder, `${Date.now()}_${sanitizedFileName}`);
          await fs.writeFile(tempFilePath, fileBuffer);
          
          logger.info(`Archivo local copiado a: ${tempFilePath}`);
          
          return {
            buffer: fileBuffer,
            tempFilePath
          };
        } else {
          logger.warn(`Archivo local no encontrado: ${localFilePath}`);
        }
      }
      
      // Si no es la canción especial o no se encontró localmente, intentar descargar desde Hostinger
      // Construir la URL completa
      const fileUrl = `${this.baseUrl}${encodeURIComponent(sanitizedFileName)}`;
      
      logger.info(`Intentando descargar archivo desde Hostinger: ${fileUrl}`);
      logger.info(`URL base: ${this.baseUrl}`);
      logger.info(`Nombre de archivo sanitizado: ${sanitizedFileName}`);
      
      // Descargar el archivo
      logger.info(`Iniciando petición HTTP a: ${fileUrl}`);
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: 30000, // 30 segundos de timeout
        headers: {
          'User-Agent': 'WhatsApp-Bot/1.0'
        }
      }).catch(error => {
        logger.error(`Error en petición HTTP: ${error.message}`);
        if (error.response) {
          logger.error(`Código de estado: ${error.response.status}`);
          logger.error(`Encabezados: ${JSON.stringify(error.response.headers)}`);
        }
        throw error;
      });
      
      logger.info(`Respuesta recibida con código: ${response.status}`);
      logger.info(`Tipo de contenido: ${response.headers['content-type']}`);
      logger.info(`Tamaño de respuesta: ${response.data ? response.data.length : 0} bytes`);
      
      // Verificar que la respuesta sea exitosa
      if (response.status !== 200) {
        throw new Error(`Error al descargar archivo: ${response.status} ${response.statusText}`);
      }
      
      // Verificar que el contenido sea un MP3 válido
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.includes('audio/')) {
        throw new Error(`El archivo descargado no es un audio válido: ${contentType}`);
      }
      
      // Guardar el archivo temporalmente
      const tempFilePath = path.join(this.tempFolder, sanitizedFileName);
      await fs.writeFile(tempFilePath, response.data);
      
      logger.info(`Archivo descargado exitosamente: ${sanitizedFileName} (${response.data.length} bytes)`);
      
      // Devolver el buffer y la ruta temporal
      return {
        buffer: response.data,
        filePath: tempFilePath
      };
      
    } catch (error) {
      logger.error(`Error al descargar archivo de Hostinger: ${error.message}`);
      throw error;
    }
  }

  /**
   * Busca un archivo MP3 en Hostinger por nombre de canción
   * @param {string} songName - Nombre de la canción a buscar
   * @returns {Promise<string|null>} Nombre del archivo si se encuentra, null si no
   */
  async findSongByName(songName) {
    try {
      // Esta función es un placeholder. En un entorno real, necesitarías:
      // 1. Una API en tu hosting que devuelva la lista de archivos disponibles
      // 2. O un archivo JSON/XML con la lista de archivos que puedas consultar
      
      // Por ahora, simplemente construimos el nombre del archivo basado en el nombre de la canción
      const sanitizedSongName = this.sanitizeFileName(songName);
      const possibleFileName = `${sanitizedSongName}.mp3`;
      
      // Verificar si el archivo existe haciendo una petición HEAD
      try {
        const fileUrl = `${this.baseUrl}${encodeURIComponent(possibleFileName)}`;
        await axios({
          method: 'HEAD',
          url: fileUrl,
          timeout: 5000
        });
        
        // Si llegamos aquí, el archivo existe
        return possibleFileName;
      } catch (headError) {
        logger.debug(`Archivo no encontrado en Hostinger: ${possibleFileName}`);
        return null;
      }
    } catch (error) {
      logger.error(`Error al buscar canción en Hostinger: ${error.message}`);
      return null;
    }
  }

  /**
   * Sanitiza un nombre de archivo para hacerlo seguro
   * @param {string} fileName - Nombre de archivo a sanitizar
   * @returns {string} Nombre de archivo sanitizado
   */
  sanitizeFileName(fileName) {
    // Verificar si es la canción "pa que me invitan" y devolver el nombre exacto
    if (fileName.toLowerCase().includes('pa que me invitan')) {
      logger.info('Detectada canción especial "PA QUE ME INVITAN", usando nombre exacto');
      return 'PA QUE ME INVITAN - LOS 5 DE ORO.MP3';
    }
    
    // Para otros archivos, aplicar sanitización normal
    return fileName
      .replace(/[\/\\?%*:|"<>]/g, '-') // Reemplazar caracteres ilegales
      .replace(/ /g, '_')             // Reemplazar espacios con guiones bajos
      .substring(0, 100);             // Limitar longitud
  }

  /**
   * Limpia archivos temporales antiguos
   */
  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempFolder);
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.tempFolder, file);
        const stats = await fs.stat(filePath);
        
        // Eliminar archivos con más de 1 hora
        if (now - stats.mtimeMs > 60 * 60 * 1000) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Limpieza completada: ${deletedCount} archivos temporales de Hostinger eliminados`);
      }
    } catch (error) {
      logger.error(`Error en limpieza de archivos temporales de Hostinger: ${error.message}`);
    }
  }
}

// Exportar las funciones
module.exports = {
  downloadFile: async (fileName) => {
    const hostingerService = new HostingerService();
    return hostingerService.downloadFile(fileName);
  },
  findSongByName: async (songName) => {
    const hostingerService = new HostingerService();
    return hostingerService.findSongByName(songName);
  },
  sanitizeFileName: (fileName) => {
    const hostingerService = new HostingerService();
    return hostingerService.sanitizeFileName(fileName);
  }
};
