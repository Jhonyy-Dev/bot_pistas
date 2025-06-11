const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const logger = require('../config/logger');

/**
 * Servicio para manejar archivos MP3 locales
 */
class LocalMp3Service {
  constructor() {
    // Directorio donde se almacenan los archivos MP3 locales
    this.mp3Directory = path.join(__dirname, '..', 'assets', 'mp3');
    logger.info(`Directorio MP3 configurado en: ${this.mp3Directory}`);
    
    // Verificar que el directorio MP3 exista
    if (!fs.existsSync(this.mp3Directory)) {
      logger.error(`¡El directorio MP3 no existe! Ruta: ${this.mp3Directory}`);
      // Intentar crear el directorio
      try {
        fs.mkdirSync(this.mp3Directory, { recursive: true });
        logger.info(`Directorio MP3 creado: ${this.mp3Directory}`);
      } catch (error) {
        logger.error(`Error al crear directorio MP3: ${error.message}`);
      }
    } else {
      logger.info(`Directorio MP3 existe correctamente`);
    }
    
    // Crear directorio temporal para archivos a enviar
    this.tempFolder = path.resolve(os.tmpdir(), 'bot_mp3_temp');
    fs.ensureDirSync(this.tempFolder);
    
    logger.info(`Servicio de MP3 local inicializado. Directorio: ${this.mp3Directory}`);
  }

  /**
   * Busca un archivo MP3 por nombre de canción
   * @param {string} songName - Nombre de la canción a buscar
   * @param {number} limit - Número máximo de coincidencias a devolver (por defecto 5)
   * @returns {Promise<Array|null>} Array de coincidencias o null si no hay ninguna
   */
  async findSongs(songName, limit = 5) {
    try {
      logger.info(`Buscando canción local: "${songName}"`);
      
      // Obtener lista de archivos en el directorio
      const files = await fs.readdir(this.mp3Directory);
      logger.info(`Total de archivos MP3 encontrados: ${files.length}`);
      
      // Mostrar algunos archivos para depuración
      if (files.length > 0) {
        logger.info(`Primeros 5 archivos en el directorio:`);
        files.slice(0, 5).forEach(file => logger.info(`- ${file}`));
      } else {
        logger.error(`No hay archivos MP3 en el directorio: ${this.mp3Directory}`);
        return null;
      }
      
      // Convertir el nombre de la canción a minúsculas para comparación
      const searchLower = songName.toLowerCase().trim();
      
      // Extraer palabras clave de la búsqueda (ignorar solo palabras muy comunes)
      const searchWords = searchLower.split(/\s+/)
        .filter(word => !['los', 'las', 'del', 'con', 'para', 'por', 'de', 'la', 'el', 'y', 'a'].includes(word));
      
      // Si no hay palabras clave después del filtrado (porque eran todas palabras comunes),
      // usar todas las palabras originales
      const finalSearchWords = searchWords.length > 0 ? searchWords : searchLower.split(/\s+/);
      
      logger.info(`Palabras clave de búsqueda: ${finalSearchWords.join(', ')}`);
      
      // Guardar el término de búsqueda completo para comparaciones
      const fullSearchTerm = searchLower;
      logger.info(`Término de búsqueda completo: "${fullSearchTerm}"`);
      
      // Estructura para almacenar coincidencias
      const matches = [];
      
      // Primero intentar coincidencia exacta
      logger.info(`Buscando coincidencias entre ${files.length} archivos MP3...`);
      for (const file of files) {
        const fileLower = file.toLowerCase();
        const fileNameWithoutExt = fileLower.replace(/\.mp3$/i, '');
        
        // Coincidencia exacta con el nombre completo
        if (fileNameWithoutExt === searchLower || fileLower === searchLower + '.mp3') {
          logger.info(`¡Coincidencia exacta encontrada!: ${file}`);
          return [{ file, score: 100, reason: 'Coincidencia exacta' }];
        }
        
        // Coincidencia si el archivo contiene el término de búsqueda completo
        if (fileLower.includes(searchLower)) {
          logger.info(`Archivo contiene el término completo "${searchLower}": ${file}`);
          matches.push({ file, score: 95, reason: 'Contiene el término completo' });
          continue;
        }
        
        // Verificar coincidencias por palabras clave
        let matchedWords = 0;
        let importantMatch = false;
        
        // Comprobar si el archivo contiene el término de búsqueda completo
        // Esto es especialmente útil para búsquedas como "tu traicion"
        if (fileLower.includes(fullSearchTerm)) {
          matchedWords = finalSearchWords.length; // Dar máxima puntuación
          importantMatch = true;
          logger.info(`Coincidencia con término completo en: ${file}`);
        } else {
          // Verificar coincidencias palabra por palabra
          for (const word of finalSearchWords) {
            if (fileLower.includes(word)) {
              matchedWords++;
              
              // Palabras importantes como nombres de artistas o títulos específicos
              if (['agua', 'marina', 'traicion', 'nectar', 'lobo', 'shapis', 'mix', 'tu'].includes(word)) {
                importantMatch = true;
              }
            }
          }
        }
        
        // Calcular puntuación basada en palabras coincidentes
        if (matchedWords > 0) {
          // Base de puntuación: porcentaje de palabras clave que coinciden
          const wordScore = (matchedWords / finalSearchWords.length) * 80;
          
          // Bonificación por palabras importantes
          let score = importantMatch ? wordScore + 15 : wordScore;
          
          // Bonificación adicional si contiene el término completo
          if (fileLower.includes(fullSearchTerm)) {
            score += 20;
          }
          
          // Solo añadir si la puntuación es mayor a 20 para evitar falsos positivos
          // pero permitir más coincidencias
          if (score > 20) {
            let reason = `Coincide con ${matchedWords}/${finalSearchWords.length} palabras clave`;
            if (importantMatch) reason += ' (incluye palabra importante)';
            if (fileLower.includes(fullSearchTerm)) reason += ' (contiene el término completo)';
            
            matches.push({ file, score, reason });
          }
        }
      }
      
      // Si hay coincidencias, devolver las mejores
      if (matches.length > 0) {
        // Ordenar por puntuación descendente
        matches.sort((a, b) => b.score - a.score);
        
        // Limitar el número de coincidencias
        const topMatches = matches.slice(0, limit);
        
        logger.info(`Se encontraron ${topMatches.length} coincidencias:`);
        topMatches.forEach((match, i) => {
          logger.info(`${i+1}. ${match.file} (puntuación: ${match.score.toFixed(2)}) - ${match.reason}`);
        });
        
        return topMatches;
      }
      
      logger.warn(`No se encontró ninguna canción que coincida con: "${songName}"`);
      return null;
    } catch (error) {
      logger.error(`Error al buscar canción: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Busca un archivo MP3 por nombre de canción (devuelve solo la mejor coincidencia)
   * @param {string} songName - Nombre de la canción a buscar
   * @returns {Promise<string|null>} Nombre del archivo si se encuentra, null si no
   */
  async findSong(songName) {
    const matches = await this.findSongs(songName, 1);
    if (matches && matches.length > 0) {
      return matches[0].file;
    }
    return null;
  }
  
  /**
   * Genera posibles nombres de archivo basados en el nombre de la canción
   * @param {string} songName - Nombre de la canción
   * @returns {Array<string>} Lista de posibles nombres de archivo
   */
  generatePossibleFileNames(songName) {
    const cleanName = songName.trim();
    const result = new Set();
    
    // Nombre original con extensión
    result.add(`${cleanName}.mp3`);
    
    // Nombre en minúsculas
    result.add(`${cleanName.toLowerCase()}.mp3`);
    
    // Nombre en mayúsculas
    result.add(`${cleanName.toUpperCase()}.mp3`);
    
    // Sin extensión (para comparar con nombres que ya incluyen la extensión)
    result.add(cleanName);
    result.add(cleanName.toLowerCase());
    result.add(cleanName.toUpperCase());
    
    // Reemplazar espacios por guiones bajos
    const underscoreName = cleanName.replace(/ /g, '_');
    result.add(`${underscoreName}.mp3`);
    
    // Reemplazar espacios por guiones
    const dashName = cleanName.replace(/ /g, '-');
    result.add(`${dashName}.mp3`);
    
    // Palabras clave para búsqueda parcial
    const keywords = cleanName.split(' ')
      .filter(word => word.length > 2) // Ignorar palabras muy cortas
      .map(word => word.toLowerCase());
    
    // Añadir palabras clave individuales para búsqueda más flexible
    keywords.forEach(keyword => result.add(keyword));
    
    return [...result];
  }

  /**
   * Obtiene un archivo MP3 por su nombre
   * @param {string} fileName - Nombre del archivo a obtener
   * @returns {Promise<Object>} Objeto con buffer del archivo y ruta temporal
   */
  async getFile(fileName) {
    try {
      // Ruta completa al archivo
      const filePath = path.join(this.mp3Directory, fileName);
      
      logger.info(`Obteniendo archivo local: ${filePath}`);
      
      // Verificar si el archivo existe
      if (!(await fs.pathExists(filePath))) {
        throw new Error(`Archivo no encontrado: ${fileName}`);
      }
      
      // Leer el archivo
      const fileBuffer = await fs.readFile(filePath);
      
      // Crear un archivo temporal para enviarlo
      const tempFilePath = path.join(this.tempFolder, `${Date.now()}_${fileName}`);
      await fs.writeFile(tempFilePath, fileBuffer);
      
      logger.info(`Archivo copiado a ubicación temporal: ${tempFilePath}`);
      
      return {
        buffer: fileBuffer,
        tempFilePath
      };
    } catch (error) {
      logger.error(`Error al obtener archivo: ${error.message}`);
      throw error;
    }
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
        
        // Eliminar archivos de más de 1 hora
        if (now - stats.mtimeMs > 3600000) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Se eliminaron ${deletedCount} archivos temporales antiguos`);
      }
    } catch (error) {
      logger.error(`Error al limpiar archivos temporales: ${error.message}`);
    }
  }
}

module.exports = new LocalMp3Service();
