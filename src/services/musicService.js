/**
 * Servicio para gestionar la música y su integración con Backblaze B2
 * Proporciona funciones para buscar, reproducir y gestionar canciones
 */

const backblazeService = require('./backblazeService');
const { sequelize } = require('../config/database');
const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

/**
 * Busca canciones en la base de datos según un término de búsqueda
 * @param {string} termino - Término de búsqueda (título, artista, álbum)
 * @param {number} [limite=5] - Número máximo de resultados
 * @param {boolean} [usarCache=true] - Si se debe usar la caché de búsquedas
 * @returns {Promise<Array>} - Lista de canciones encontradas
 */
async function buscarCanciones(termino, limite = 100, usarCache = true) {
  try {
    // Intentar usar el procedimiento almacenado optimizado con caché
    try {
      const [results] = await sequelize.query(
        'CALL buscar_canciones_cache(?, ?, ?)',
        {
          replacements: [termino, limite, usarCache],
          type: Sequelize.QueryTypes.RAW
        }
      );
      
      // El procedimiento almacenado devuelve un array de resultsets, tomamos el primero
      const canciones = results[0] || [];
      logger.info(`Procedimiento almacenado encontró ${canciones.length} canciones para "${termino}"`);
      return canciones;
    } catch (procError) {
      logger.warn(`Procedimiento almacenado falló, usando búsqueda directa: ${procError.message}`);
      
      // Respaldo: Búsqueda directa con SQL
      const terminoNormalizado = `%${termino.toLowerCase()}%`;
      
      const cancionesSql = await sequelize.query(`
        SELECT 
          id,
          nombre,
          artista,
          album,
          genero,
          archivo_nombre,
          archivo_path,
          tamanio_mb,
          veces_reproducida,
          'mysql' as origen
        FROM canciones 
        WHERE 
          LOWER(nombre) LIKE ? OR 
          LOWER(artista) LIKE ? OR 
          LOWER(album) LIKE ? OR
          LOWER(archivo_nombre) LIKE ?
        ORDER BY veces_reproducida DESC, nombre ASC
        LIMIT ?
      `, {
        replacements: [terminoNormalizado, terminoNormalizado, terminoNormalizado, terminoNormalizado, limite],
        type: Sequelize.QueryTypes.SELECT
      });
      
      logger.info(`Búsqueda directa encontró ${cancionesSql.length} canciones para "${termino}"`);
      return cancionesSql;
    }
  } catch (error) {
    logger.error('Error buscando canciones:', error);
    throw error;
  }
}

/**
 * Obtiene una canción por su ID
 * @param {number} id - ID de la canción
 * @returns {Promise<Object|null>} - Datos de la canción o null si no existe
 */
async function obtenerCancionPorId(id) {
  try {
    const [rows] = await sequelize.query(
      'SELECT * FROM canciones WHERE id = ?',
      {
        replacements: [id],
        type: Sequelize.QueryTypes.SELECT
      }
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    logger.error('Error obteniendo canción por ID:', error);
    throw error;
  }
}

/**
 * Obtiene una canción por su nombre de archivo o ruta
 * @param {string} archivo - Nombre o ruta del archivo
 * @returns {Promise<Object|null>} - Datos de la canción o null si no existe
 */
async function obtenerCancionPorArchivo(archivo) {
  try {
    // Buscar por ruta exacta o por nombre de archivo
    const [rows] = await sequelize.query(
      'SELECT * FROM canciones WHERE ruta_archivo = ? OR ruta_archivo LIKE ?',
      {
        replacements: [archivo, `%${archivo}`],
        type: Sequelize.QueryTypes.SELECT
      }
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    logger.error('Error obteniendo canción por archivo:', error);
    throw error;
  }
}

/**
 * Descarga un archivo MP3 desde Backblaze B2
 * @param {Object} cancion - Objeto canción con archivo_path
 * @returns {Promise<string>} - Ruta local del archivo descargado
 */
async function descargarCancion(cancion) {
  if (!cancion || !cancion.archivo_path) {
    throw new Error('Datos de canción inválidos');
  }
  
  try {
    // Verificar que el archivo existe en B2
    const existe = await backblazeService.verificarArchivoExiste(cancion.archivo_path);
    if (!existe) {
      throw new Error(`El archivo ${cancion.archivo_path} no existe en Backblaze B2`);
    }
    
    // Descargar el archivo
    return await backblazeService.descargarMp3(cancion.archivo_path);
  } catch (error) {
    console.error(`Error descargando canción ID ${cancion.id}:`, error);
    throw error;
  }
}

/**
 * Genera una URL firmada para acceder directamente a una canción
 * @param {Object} cancion - Objeto canción con archivo_path
 * @param {number} [expiresIn=3600] - Tiempo de expiración en segundos
 * @returns {Promise<string>} - URL firmada
 */
async function generarUrlCancion(cancion, expiresIn = 3600) {
  if (!cancion || !cancion.archivo_path) {
    throw new Error('Datos de canción inválidos');
  }
  
  try {
    return await backblazeService.generarUrlFirmada(cancion.archivo_path, expiresIn);
  } catch (error) {
    console.error(`Error generando URL para canción ID ${cancion.id}:`, error);
    throw error;
  }
}

/**
 * Registra una reproducción de canción en la base de datos
 * @param {number} cancionId - ID de la canción
 * @param {string} usuarioWhatsapp - Número de WhatsApp del usuario
 * @returns {Promise<void>}
 */
async function registrarReproduccion(cancionId, usuarioWhatsapp) {
  try {
    await sequelize.query('CALL registrar_reproduccion(?, ?)', {
      replacements: [cancionId, usuarioWhatsapp],
      type: Sequelize.QueryTypes.RAW
    });
  } catch (error) {
    logger.error('Error registrando reproducción:', error);
    // No lanzamos el error para no interrumpir el flujo principal
  }
}

/**
 * Registra una búsqueda fallida en la base de datos
 * @param {string} termino - Término de búsqueda que no tuvo resultados
 * @param {string} usuarioWhatsapp - Número de WhatsApp del usuario
 * @returns {Promise<void>}
 */
async function registrarBusquedaFallida(termino, usuarioWhatsapp) {
  try {
    await sequelize.query('CALL registrar_busqueda_fallida(?, ?)', {
      replacements: [termino, usuarioWhatsapp],
      type: Sequelize.QueryTypes.RAW
    });
  } catch (error) {
    logger.error('Error registrando búsqueda fallida:', error);
    // No lanzamos el error para no interrumpir el flujo principal
  }
}

/**
 * Obtiene estadísticas generales del sistema
 * @returns {Promise<Object>} - Estadísticas del sistema
 */
async function obtenerEstadisticas() {
  try {
    const [results] = await sequelize.query('CALL obtener_estadisticas()', {
      type: Sequelize.QueryTypes.RAW
    });
    return results[0][0]; // El procedimiento devuelve un único registro
  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error);
    throw error;
  }
}

/**
 * Agrega una nueva canción a la base de datos
 * @param {Object} datos - Datos de la canción
 * @returns {Promise<number>} - ID de la canción creada
 */
async function agregarCancion(datos) {
  try {
    // Usar el procedimiento optimizado para insertar o actualizar canciones
    const [result] = await sequelize.query(
      'CALL insertar_actualizar_canciones_lote(?, ?, ?, ?, ?, ?, ?, ?)',
      {
        replacements: [
          datos.titulo,
          datos.artista,
          datos.album || null,
          datos.genero || null,
          datos.duracion || null,
          datos.archivo_path,
          datos.tamanio_bytes || 0,
          datos.hash_contenido || null
        ],
        type: Sequelize.QueryTypes.RAW
      }
    );
    
    // Buscar el ID de la canción insertada o actualizada
    const [cancion] = await sequelize.query(
      'SELECT id FROM canciones WHERE ruta_archivo = ? LIMIT 1',
      {
        replacements: [datos.archivo_path],
        type: Sequelize.QueryTypes.SELECT
      }
    );
    
    return cancion ? cancion.id : null;
  } catch (error) {
    logger.error('Error agregando canción:', error);
    throw error;
  }
}

/**
 * Limpia los archivos temporales descargados
 * @param {string} filePath - Ruta del archivo a eliminar
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
async function limpiarArchivoTemporal(filePath) {
  return new Promise((resolve) => {
    if (!filePath || !fs.existsSync(filePath)) {
      resolve(false);
      return;
    }
    
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error eliminando archivo temporal:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  buscarCanciones,
  obtenerCancionPorId,
  obtenerCancionPorArchivo,
  descargarCancion,
  generarUrlCancion,
  registrarReproduccion,
  registrarBusquedaFallida,
  obtenerEstadisticas,
  agregarCancion,
  limpiarArchivoTemporal
};
