/**
 * Manejador alternativo de canciones para cuando la base de datos está vacía o corrupta
 * Este módulo proporciona funcionalidad para buscar y enviar canciones usando archivos locales
 * cuando no es posible usar la base de datos o los IDs de Google Drive
 */
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const logger = require('../config/logger');

// Carpetas donde buscar archivos MP3 (relative al raíz del proyecto)
const MP3_FOLDERS = [
  './mp3',
  './audio',
  './musica',
  './canciones',
  './pistas',
  './files',
  './uploads'
];

/**
 * Busca canciones por nombre en las carpetas locales
 * @param {string} searchTerm - Término de búsqueda
 * @returns {Promise<Array>} - Lista de canciones encontradas
 */
async function buscarCancionesLocales(searchTerm) {
  try {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }
    
    const searchTermLower = searchTerm.toLowerCase();
    let cancionesEncontradas = [];
    
    // Buscar en todos los directorios configurados
    for (const folder of MP3_FOLDERS) {
      try {
        if (!fs.existsSync(folder)) {
          continue;
        }
        
        const files = await readdir(folder);
        
        // Filtrar solo archivos MP3 que contengan el término de búsqueda
        const mp3Files = files.filter(file => {
          return file.toLowerCase().endsWith('.mp3') && 
                 file.toLowerCase().includes(searchTermLower);
        });
        
        // Convertir archivos encontrados al formato esperado
        const canciones = mp3Files.map((file, index) => {
          // Extraer nombre y artista del nombre del archivo
          // Formato esperado: "Artista - Nombre.mp3" o solo "Nombre.mp3"
          const fileName = path.basename(file, '.mp3');
          let nombre = fileName;
          let artista = 'Desconocido';
          
          if (fileName.includes(' - ')) {
            const parts = fileName.split(' - ');
            artista = parts[0].trim();
            nombre = parts.slice(1).join(' - ').trim();
          }
          
          return {
            id: index + 1000, // Usar IDs grandes para evitar conflictos
            nombre: nombre,
            artista: artista,
            album: 'Local',
            genero: 'Variado',
            ruta_archivo: path.join(folder, file),
            tamanio_bytes: null,
            fecha_subida: new Date(),
            local: true // Marcar como archivo local para el handler
          };
        });
        
        cancionesEncontradas = [...cancionesEncontradas, ...canciones];
      } catch (error) {
        logger.error(`Error al buscar en carpeta ${folder}: ${error.message}`);
      }
    }
    
    // Ordenar por relevancia (cuánto coincide con el término de búsqueda)
    cancionesEncontradas.sort((a, b) => {
      const aRelevancia = calcularRelevancia(a, searchTermLower);
      const bRelevancia = calcularRelevancia(b, searchTermLower);
      return bRelevancia - aRelevancia;
    });
    
    return cancionesEncontradas;
  } catch (error) {
    logger.error(`Error al buscar canciones locales: ${error.message}`);
    return [];
  }
}

/**
 * Calcula la relevancia de una canción respecto al término de búsqueda
 * @param {Object} cancion - Canción a evaluar
 * @param {string} searchTerm - Término de búsqueda (ya en minúsculas)
 * @returns {number} - Puntuación de relevancia
 */
function calcularRelevancia(cancion, searchTerm) {
  let relevancia = 0;
  const nombreLower = cancion.nombre.toLowerCase();
  const artistaLower = cancion.artista.toLowerCase();
  
  // Coincidencia exacta en nombre
  if (nombreLower === searchTerm) {
    relevancia += 100;
  } 
  // Nombre comienza con el término
  else if (nombreLower.startsWith(searchTerm)) {
    relevancia += 75;
  }
  // Nombre contiene el término
  else if (nombreLower.includes(searchTerm)) {
    relevancia += 50;
  }
  
  // Puntos adicionales por coincidencia en artista
  if (artistaLower === searchTerm) {
    relevancia += 40;
  } else if (artistaLower.includes(searchTerm)) {
    relevancia += 25;
  }
  
  return relevancia;
}

/**
 * Envía una canción local al usuario por WhatsApp
 * @param {Object} socket - Conexión de WhatsApp
 * @param {string} sender - Número del remitente
 * @param {Object} cancion - Datos de la canción a enviar
 * @returns {Promise<boolean>} - true si se envió correctamente
 */
async function enviarCancionLocal(socket, sender, cancion) {
  try {
    if (!cancion || !cancion.ruta_archivo || !fs.existsSync(cancion.ruta_archivo)) {
      logger.error(`Archivo no encontrado: ${cancion.ruta_archivo}`);
      return false;
    }
    
    // Leer el archivo
    const buffer = fs.readFileSync(cancion.ruta_archivo);
    
    if (!buffer || buffer.length === 0) {
      logger.error('El archivo leído está vacío');
      return false;
    }
    
    // Preparar datos para el envío
    const fileName = `${cancion.artista} - ${cancion.nombre}.mp3`;
    const caption = `🎵 *${cancion.nombre}*\n👨‍🎤 ${cancion.artista}\n\nSubido por MúsicaKit`;
    
    // Enviar el archivo
    await socket.sendMessage(sender, {
      document: buffer,
      mimetype: 'audio/mpeg',
      fileName: fileName,
      caption
    });
    
    logger.info(`Canción local enviada correctamente: ${fileName}`);
    return true;
  } catch (error) {
    logger.error(`Error al enviar canción local: ${error.message}`);
    return false;
  }
}

/**
 * Busca las carpetas disponibles con archivos MP3
 * @returns {Promise<Array>} - Lista de carpetas con archivos MP3
 */
async function buscarCarpetasMP3() {
  const carpetasValidas = [];
  
  for (const folder of MP3_FOLDERS) {
    try {
      if (!fs.existsSync(folder)) {
        continue;
      }
      
      const files = await readdir(folder);
      const mp3Count = files.filter(file => file.toLowerCase().endsWith('.mp3')).length;
      
      if (mp3Count > 0) {
        carpetasValidas.push({
          path: folder,
          fileCount: mp3Count
        });
      }
    } catch (error) {
      logger.error(`Error al examinar carpeta ${folder}: ${error.message}`);
    }
  }
  
  return carpetasValidas;
}

module.exports = {
  buscarCancionesLocales,
  enviarCancionLocal,
  buscarCarpetasMP3
};
