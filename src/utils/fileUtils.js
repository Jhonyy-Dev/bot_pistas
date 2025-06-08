const path = require('path');
const fs = require('fs-extra');
const logger = require('../config/logger');

/**
 * Obtiene información de un archivo MP3
 * @param {string} filePath - Ruta al archivo MP3
 * @returns {Promise<Object>} Información del archivo
 */
const getFileInfo = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);
    
    return {
      nombre: fileName.replace(path.extname(fileName), ''),
      ruta_archivo: path.relative(process.env.MP3_FOLDER || './mp3', filePath),
      tamanio_bytes: stats.size,
      fecha_subida: stats.birthtime
    };
  } catch (error) {
    logger.error(`Error al obtener información del archivo ${filePath}: ${error.message}`);
    throw error;
  }
};

/**
 * Escanea el directorio de MP3 para encontrar archivos
 * @returns {Promise<Array>} Lista de archivos MP3 encontrados
 */
const scanMp3Directory = async () => {
  try {
    const mp3Dir = process.env.MP3_FOLDER || './mp3';
    await fs.ensureDir(mp3Dir);
    
    const files = await fs.readdir(mp3Dir);
    const mp3Files = files.filter(file => path.extname(file).toLowerCase() === '.mp3');
    
    return mp3Files.map(file => path.join(mp3Dir, file));
  } catch (error) {
    logger.error(`Error al escanear directorio de MP3: ${error.message}`);
    return [];
  }
};

/**
 * Importa MP3s al sistema
 * @returns {Promise<number>} Número de archivos importados
 */
const importarMp3s = async () => {
  const { Cancion } = require('../database/models');
  let importados = 0;
  
  try {
    const mp3Files = await scanMp3Directory();
    
    for (const filePath of mp3Files) {
      try {
        const relativePath = path.relative(process.env.MP3_FOLDER || './mp3', filePath);
        
        // Verificar si el archivo ya está en la base de datos
        const existente = await Cancion.findOne({
          where: { ruta_archivo: relativePath }
        });
        
        if (!existente) {
          const fileInfo = await getFileInfo(filePath);
          
          // Extraer información del nombre del archivo
          // Asumiendo formato "Artista - Nombre.mp3" o simplemente "Nombre.mp3"
          const fileName = path.basename(filePath, '.mp3');
          let artista = 'Desconocido';
          let nombre = fileName;
          
          if (fileName.includes(' - ')) {
            [artista, nombre] = fileName.split(' - ', 2);
          }
          
          // Crear entrada en la base de datos
          await Cancion.create({
            nombre,
            artista,
            album: 'Desconocido',
            ruta_archivo: relativePath,
            tamanio_bytes: fileInfo.tamanio_bytes,
            fecha_subida: new Date()
          });
          
          importados++;
        }
      } catch (error) {
        logger.error(`Error al importar archivo ${filePath}: ${error.message}`);
        continue;
      }
    }
    
    logger.info(`Importación completada. ${importados} archivos nuevos importados.`);
    return importados;
  } catch (error) {
    logger.error(`Error en la importación de MP3s: ${error.message}`);
    return 0;
  }
};

module.exports = {
  getFileInfo,
  scanMp3Directory,
  importarMp3s
};
