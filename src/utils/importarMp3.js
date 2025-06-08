/**
 * Script para importar nuevos archivos MP3 al sistema
 * Este script escanea la carpeta MP3, identifica archivos nuevos
 * y los agrega a la base de datos.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const mm = require('music-metadata');
const { sequelize } = require('../config/database');
const { Cancion } = require('../database/models');
const logger = require('../config/logger');

// Directorio donde están los archivos MP3
const MP3_DIR = path.resolve(process.env.MP3_FOLDER || './mp3');

/**
 * Extrae metadatos de un archivo MP3
 */
async function getMetadata(filePath) {
  try {
    const metadata = await mm.parseFile(filePath);
    return {
      title: metadata.common.title,
      artist: metadata.common.artist,
      album: metadata.common.album,
      genre: metadata.common.genre ? metadata.common.genre[0] : null,
      duration: metadata.format.duration ? 
        `${Math.floor(metadata.format.duration / 60)}:${Math.floor(metadata.format.duration % 60).toString().padStart(2, '0')}` :
        null,
      bitrate: metadata.format.bitrate
    };
  } catch (error) {
    logger.warn(`No se pudieron extraer metadatos de ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Importa un solo archivo MP3 a la base de datos
 */
async function importarArchivo(filePath) {
  try {
    // Ruta relativa para almacenar en la base de datos
    const relativePath = path.relative(MP3_DIR, filePath);
    
    // Verificar si ya existe en la BD
    const cancionExistente = await Cancion.findOne({
      where: { ruta_archivo: relativePath }
    });
    
    if (cancionExistente) {
      logger.info(`El archivo ${relativePath} ya existe en la base de datos`);
      return false;
    }
    
    // Obtener estadísticas del archivo
    const stats = await fs.stat(filePath);
    
    // Intentar extraer metadatos
    const metadata = await getMetadata(filePath);
    
    // Si no hay metadatos, extraer info del nombre del archivo
    const fileName = path.basename(filePath, path.extname(filePath));
    let nombre = fileName;
    let artista = 'Desconocido';
    let album = 'Desconocido';
    
    if (fileName.includes(' - ')) {
      const parts = fileName.split(' - ');
      if (parts.length >= 2) {
        artista = parts[0].trim();
        nombre = parts[1].trim();
      }
    }
    
    // Usar metadatos si están disponibles
    if (metadata) {
      nombre = metadata.title || nombre;
      artista = metadata.artist || artista;
      album = metadata.album || album;
    }
    
    // Crear entrada en la base de datos
    await Cancion.create({
      nombre,
      artista,
      album,
      genero: metadata?.genre || 'Desconocido',
      duracion: metadata?.duration || '0:00',
      ruta_archivo: relativePath,
      tamanio_bytes: stats.size,
      fecha_subida: new Date()
    });
    
    logger.info(`Archivo importado: ${nombre} - ${artista}`);
    return true;
  } catch (error) {
    logger.error(`Error al importar ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Función principal que escanea el directorio e importa todos los MP3s
 */
async function importarTodos() {
  try {
    logger.info('Iniciando importación de MP3s...');
    
    // Asegurarse de que existe el directorio
    await fs.ensureDir(MP3_DIR);
    
    // Listar todos los archivos de la carpeta y subcarpetas
    const archivos = await getAllFiles(MP3_DIR);
    
    // Filtrar solo MP3s
    const mp3Files = archivos.filter(file => path.extname(file).toLowerCase() === '.mp3');
    
    if (mp3Files.length === 0) {
      logger.info('No se encontraron archivos MP3 para importar.');
      return 0;
    }
    
    logger.info(`Se encontraron ${mp3Files.length} archivos MP3.`);
    
    // Importar cada archivo
    let importados = 0;
    for (const file of mp3Files) {
      const resultado = await importarArchivo(file);
      if (resultado) importados++;
    }
    
    logger.info(`Importación finalizada. Se importaron ${importados} nuevos archivos.`);
    return importados;
  } catch (error) {
    logger.error(`Error en la importación: ${error.message}`);
    return 0;
  }
}

/**
 * Obtiene recursivamente todos los archivos de un directorio y sus subdirectorios
 */
async function getAllFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getAllFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

// Ejecutar si se llama directamente desde la línea de comandos
if (require.main === module) {
  // Testear conexión a la base de datos y ejecutar importación
  sequelize.authenticate()
    .then(() => {
      logger.info('Conexión a la base de datos establecida correctamente.');
      return importarTodos();
    })
    .then(count => {
      logger.info(`Proceso finalizado. ${count} archivos importados.`);
      process.exit(0);
    })
    .catch(err => {
      logger.error(`Error en el proceso de importación: ${err.message}`);
      process.exit(1);
    });
} else {
  // Exportar para uso como módulo
  module.exports = {
    importarTodos,
    importarArchivo
  };
}
