/**
 * Controlador para manejar las interacciones con Backblaze B2
 * Este controlador integra el servicio de Backblaze B2 con el bot de WhatsApp
 */

const logger = require('../config/logger');
const backblazeService = require('../services/backblazeService');
const musicService = require('../services/musicService');
const fs = require('fs-extra'); // Cambiado a fs-extra para usar ensureDir
const path = require('path');

/**
 * Busca canciones en Backblaze B2 y en la base de datos
 * @param {string} searchTerm - Término de búsqueda
 * @param {number} limit - Límite de resultados
 * @returns {Promise<Array>} - Lista de canciones encontradas
 */
async function buscarCanciones(searchTerm, limit = 500) {
  try {
    // Validar parámetros de entrada
    if (!searchTerm || typeof searchTerm !== 'string') {
      logger.error(`Término de búsqueda inválido: ${searchTerm}`);
      return [];
    }
    
    logger.info(`Buscando canciones con término: "${searchTerm}" (límite: ${limit})`);
    
    let resultadosFinales = [];
    
    // Buscar en la base de datos primero (pasando el límite correcto)
    try {
      const canciones = await musicService.buscarCanciones(searchTerm, limit, true);
      
      if (canciones && canciones.length > 0) {
        logger.info(`Se encontraron ${canciones.length} canciones en la base de datos`);
        resultadosFinales = [...canciones];
      }
    } catch (dbError) {
      logger.error(`Error al buscar en base de datos: ${dbError.message}`);
      // Continuar con la búsqueda en Backblaze B2
    }
    
    // Si tenemos menos resultados que el límite, buscar también en Backblaze B2
    const faltantes = limit - resultadosFinales.length;
    logger.info(`Faltan ${faltantes} resultados, procediendo a buscar en Backblaze B2`);
    
    if (faltantes > 0) {
      try {
        // Obtener archivos de Backblaze B2 (con un límite mucho más amplio)
        const limiteFetch = Math.min(10000, limit * 20);
        logger.info(`Obteniendo hasta ${limiteFetch} archivos de Backblaze B2`);
        
        const archivos = await backblazeService.listarArchivos('', limiteFetch);
        logger.info(`Backblaze B2 devolvió ${archivos.length} archivos totales`);
        
        if (!archivos || archivos.length === 0) {
          logger.warn('No se encontraron archivos en Backblaze B2');
          return resultadosFinales;
        }
        
        // Verificar que archivos sea un array válido
        if (!Array.isArray(archivos)) {
          logger.error('La respuesta de Backblaze B2 no es un array válido');
          return resultadosFinales;
        }
        
        // Si no hay archivos, retornar lo que ya tenemos
        if (archivos.length === 0) {
          logger.info('No se encontraron archivos en Backblaze B2');
          return resultadosFinales;
        }
        
        // Usar un algoritmo EXTREMADAMENTE simple y tolerante (como funcionaba originalmente)
        // Solo normalizamos a minúsculas para maximizar las coincidencias
        const searchTermLower = searchTerm.toLowerCase().trim();
        
        // Crear una variante sin espacios para mayor flexibilidad
        const searchTermNoSpaces = searchTermLower.replace(/\s+/g, '');
        
        // Extraer la primera palabra si hay espacios
        let firstWord = searchTermLower;
        if (searchTermLower.includes(' ')) {
          firstWord = searchTermLower.split(' ')[0];
        }
        
        logger.info(`Términos simplificados: original="${searchTermLower}", sin espacios="${searchTermNoSpaces}", primera palabra="${firstWord}"`);
        
        // Usamos términos muy básicos, similar a la versión anterior que encontraba 87 resultados
        // Añadimos el término original y otras variantes simples que maximicen coincidencias
        const normalizedSearchTerms = [
          searchTermLower,
          searchTermNoSpaces,
          firstWord,
          // Si la palabra clave es corta, la usamos tal cual para maximizar resultados
          searchTermLower.length <= 6 ? searchTermLower : searchTermLower.substring(0, 5)
        ];
        
        logger.info(`Términos de búsqueda normalizados: ${JSON.stringify(normalizedSearchTerms)}`);
        
        // Obtener nombres ya existentes para evitar duplicados
        const nombresExistentes = new Set(resultadosFinales.map(cancion => 
          cancion.archivo_nombre || cancion.nombre
        ));
        
        // Buscar coincidencias con mayor flexibilidad
        const resultadosB2 = [];
        
        for (const archivo of archivos) {
          try {
            // Verificar que el archivo tenga las propiedades necesarias
            if (!archivo || (!archivo.Key && !archivo.nombre)) {
              continue;
            }
            
            // Usar Key si existe, sino usar nombre (compatibilidad con diferentes formatos de respuesta)
            const nombreArchivo = archivo.Key || archivo.nombre;
            
            // Solo archivos MP3
            if (!nombreArchivo.toLowerCase().endsWith('.mp3')) continue;
            
            // Evitar duplicados
            if (nombresExistentes.has(nombreArchivo)) continue;
            
            // Usar el algoritmo extremadamente simple que funcionaba antes
            const nombreArchivoLower = nombreArchivo.toLowerCase();
            let nombreSinExtension = nombreArchivoLower.replace(/\.mp3$/i, '');
            
            // Verificar si el nombre contiene el término de búsqueda (como funcionaba anteriormente)
            let coincidencia = false;
            
            // Algoritmo extremadamente laxo para encontrar TODAS las coincidencias posibles
            // Estamos buscando maximizar resultados para restaurar el comportamiento original
            
            // Comprobación básica: el nombre contiene alguno de los términos de búsqueda
            if (nombreArchivoLower.includes(searchTermLower) || 
                nombreArchivoLower.includes(searchTermNoSpaces) || 
                nombreArchivoLower.includes(firstWord)) {
              coincidencia = true;
            }
            
            // Si la búsqueda es "ritmo", encontrar todo lo que contenga "ritm"
            if (!coincidencia && searchTermLower.length >= 4) {
              const prefijo = searchTermLower.substring(0, Math.min(4, searchTermLower.length));
              if (nombreArchivoLower.includes(prefijo)) {
                coincidencia = true;
              }
            }
            
            // Para términos muy cortos como "mix", "dj", ser MUY flexibles
            if (!coincidencia && searchTermLower.length <= 3) {
              coincidencia = nombreArchivoLower.includes(searchTermLower);
            }
            
            // Para el caso específico de "ritmo", aceptar coincidencias con "rhythm" también
            if (!coincidencia && (searchTermLower === "ritmo" || firstWord === "ritmo")) {
              if (nombreArchivoLower.includes("rhythm") || nombreArchivoLower.includes("ritm")) {
                coincidencia = true;
              }
            }
            
            if (coincidencia) {
              resultadosB2.push({
                id: null, // No existe en la base de datos
                nombre: nombreArchivo.replace('.mp3', ''),
                artista: 'Desconocido',
                archivo_nombre: nombreArchivo,
                archivo_path: nombreArchivo,
                tamanio_mb: archivo.Size || archivo.tamaño ? ((archivo.Size || archivo.tamaño) / (1024 * 1024)).toFixed(2) : '0',
                veces_reproducida: 0,
                es_backblaze: true // Marcar como archivo de Backblaze
              });
              
              // Si alcanzamos el límite de faltantes, detenemos la búsqueda
              if (resultadosB2.length >= faltantes) break;
            }
          } catch (fileError) {
            logger.error(`Error procesando archivo: ${fileError.message}`);
            // Continuar con el siguiente archivo
          }
        }
        
        logger.info(`Se encontraron ${resultadosB2.length} canciones adicionales en Backblaze B2`);
        resultadosFinales = [...resultadosFinales, ...resultadosB2];
      } catch (b2Error) {
        logger.error(`Error al listar archivos de Backblaze B2: ${b2Error.message}`);
        // Si hay error con B2 pero tenemos resultados de DB, los devolvemos
        if (resultadosFinales.length > 0) {
          return resultadosFinales;
        }
        return [];
      }
    }
    
    // Limitar los resultados finales
    const resultadosLimitados = resultadosFinales.slice(0, limit);
    logger.info(`Devolviendo ${resultadosLimitados.length} canciones en total`);
    
    return resultadosLimitados;
  } catch (error) {
    logger.error(`Error al buscar canciones: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene una canción por su nombre de archivo
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<Object>} - Información de la canción
 */
async function obtenerCancionPorArchivo(fileName) {
  try {
    logger.info(`Buscando canción con nombre de archivo: "${fileName}"`);
    
    // Verificar si existe en la base de datos usando una consulta directa
    // ya que el servicio musicService no tiene la función obtenerCancionPorArchivo
    const { sequelize } = require('../config/database');
    const { Sequelize } = require('sequelize');
    
    const [cancion] = await sequelize.query(
      'SELECT * FROM canciones WHERE ruta_archivo = ? LIMIT 1',
      {
        replacements: [fileName],
        type: Sequelize.QueryTypes.SELECT
      }
    );
    
    if (cancion) {
      logger.info(`Canción encontrada en la base de datos: ${cancion.nombre}`);
      return cancion;
    }
    
    // Si no existe en la base de datos, verificar en Backblaze B2
    logger.info('Canción no encontrada en la base de datos, verificando en Backblaze B2...');
    const existe = await backblazeService.verificarArchivoExiste(fileName);
    
    if (!existe) {
      logger.error(`Canción no encontrada en Backblaze B2: ${fileName}`);
      throw new Error(`No se encontró la canción: ${fileName}`);
    }
    
    // Obtener información del archivo
    const info = await backblazeService.obtenerInfoArchivo(fileName);
    
    // Crear un objeto canción con la información disponible
    return {
      id: null, // No existe en la base de datos
      nombre: fileName.replace('.mp3', ''),
      artista: 'Desconocido', // No tenemos esta información
      archivo_nombre: fileName,
      archivo_path: fileName,
      tamanio_mb: (info.tamanio / (1024 * 1024)).toFixed(2),
      veces_reproducida: 0,
      es_backblaze: true // Marcar como archivo de Backblaze
    };
  } catch (error) {
    logger.error(`Error al obtener canción por archivo: ${error.message}`);
    throw error;
  }
}

/**
 * Descarga una canción desde Backblaze B2
 * @param {string} fileName - Nombre del archivo a descargar
 * @returns {Promise<{buffer: Buffer, rutaArchivo: string}>} - Buffer del archivo y ruta temporal
 */
async function descargarCancion(fileName) {
  try {
    logger.info(`Descargando canción desde Backblaze B2: ${fileName}`);
    
    // Descargar el archivo desde Backblaze B2 con un timeout más corto
    // Ahora descargarMp3 devuelve directamente un Buffer, no un objeto
    const buffer = await Promise.race([
      backblazeService.descargarMp3(fileName),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout descargando archivo')), 15000)
      )
    ]);
    
    // Verificar que el buffer sea válido
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('El servicio no devolvió un buffer válido');
    }
    
    // Guardar el archivo temporalmente en paralelo con el envío
    const tempDir = path.join(process.cwd(), 'mp3');
    await fs.ensureDir(tempDir);
    
    const tempFileName = `${Date.now()}_${fileName}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    // No esperamos a que termine la escritura para devolver el buffer
    fs.writeFile(tempFilePath, buffer)
      .then(() => console.log(`Archivo descargado: ${tempFilePath}`))
      .catch(err => logger.error(`Error guardando archivo temporal: ${err.message}`));
    
    return {
      buffer,
      rutaArchivo: tempFilePath
    };
  } catch (error) {
    logger.error(`Error al descargar canción desde Backblaze B2: ${error.message}`);
    throw error;
  }
}

/**
 * Registra la reproducción de una canción
 * @param {Object} cancion - Información de la canción
 * @param {string} usuarioWhatsapp - Número de WhatsApp del usuario
 */
async function registrarReproduccion(cancion, usuarioWhatsapp) {
  try {
    // Si la canción tiene ID (está en la base de datos), registrar reproducción
    if (cancion.id) {
      await musicService.registrarReproduccion(cancion.id, usuarioWhatsapp);
      logger.info(`Reproducción registrada para canción ID ${cancion.id} por usuario ${usuarioWhatsapp}`);
    } else {
      // Si la canción no está en la base de datos, intentar agregarla
      logger.info(`Intentando agregar canción a la base de datos: ${cancion.nombre}`);
      
      try {
        // Calcular hash de contenido si es posible
        let hashContenido = null;
        if (cancion.buffer) {
          const crypto = require('crypto');
          hashContenido = crypto
            .createHash('sha256')
            .update(cancion.buffer)
            .digest('hex');
        }
        
        // Convertir tamaño a bytes si viene en MB
        const tamanioBytes = cancion.tamanio_bytes || 
                           (cancion.tamanio_mb ? Math.round(parseFloat(cancion.tamanio_mb) * 1024 * 1024) : 0);
        
        const cancionId = await musicService.agregarCancion({
          titulo: cancion.nombre,
          artista: cancion.artista || 'Desconocido',
          album: cancion.album || 'Desconocido',
          genero: cancion.genero || 'Desconocido',
          duracion: cancion.duracion || '00:00',
          archivo_path: cancion.archivo_path || cancion.ruta_archivo,
          tamanio_bytes: tamanioBytes,
          hash_contenido: hashContenido
        });
        
        // Si se agregó correctamente, registrar reproducción
        if (cancionId) {
          await musicService.registrarReproduccion(cancionId, usuarioWhatsapp);
          logger.info(`Canción agregada a la base de datos con ID ${cancionId} y reproducción registrada`);
        }
      } catch (error) {
        logger.error(`Error al agregar canción a la base de datos: ${error.message}`);
        // No interrumpir el flujo si hay error al agregar la canción
      }
    }
  } catch (error) {
    logger.error(`Error al registrar reproducción: ${error.message}`);
    // No interrumpir el flujo si hay error al registrar la reproducción
  }
}

/**
 * Limpia los archivos temporales
 */
async function limpiarArchivosTemporales() {
  try {
    // Obtener lista de archivos temporales en la carpeta temp
    const tempDir = path.join(process.cwd(), 'temp');
    
    // Crear la carpeta temp si no existe
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      logger.info('Carpeta temporal creada');
      return;
    }
    
    // Leer archivos en la carpeta temp
    const files = fs.readdirSync(tempDir);
    
    // Limpiar cada archivo
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      await musicService.limpiarArchivoTemporal(filePath);
    }
    
    logger.info(`${files.length} archivos temporales limpiados`);
  } catch (error) {
    logger.error(`Error al limpiar archivos temporales: ${error.message}`);
  }
}

module.exports = {
  buscarCanciones,
  obtenerCancionPorArchivo,
  descargarCancion,
  registrarReproduccion,
  limpiarArchivosTemporales
};
