const path = require('path');
const fs = require('fs-extra');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Cancion } = require('../database/models');
const logger = require('../config/logger');

/**
 * Busca canciones en la base de datos
 * @param {string} searchTerm - Término de búsqueda
 * @returns {Promise<Array>} Lista de canciones encontradas
 */
const buscarCanciones = async (searchTerm) => {
  try {
    // Procesar el término de búsqueda para mejorar resultados
    const termino = searchTerm.replace(/[%_]/g, '\\$&').trim().toLowerCase();
    
    // Crear array de palabras clave para búsqueda (eliminar palabras comunes como "la", "el", "de")
    const palabrasClave = termino
      .split(/\s+/)
      .filter(palabra => !["la", "el", "los", "las", "de", "del", "y", "con", "sin", "a"].includes(palabra));
      
    // Lista de artistas/grupos populares para búsqueda directa
    const artistasPopulares = [
      { patron: /josimar|yambu|yamb[u|\u00fa]/i, nombre: "josimar" },
      { patron: /grupo ?5|grupo ?cinco/i, nombre: "grupo 5" },
      { patron: /caribe[n|\u00f1]os/i, nombre: "caribeños" },
      { patron: /gianmarco|gian ?marco/i, nombre: "gianmarco" },
      { patron: /zaperoko/i, nombre: "zaperoko" },
      { patron: /hector ?lavoe|lavoe/i, nombre: "hector lavoe" },
      { patron: /adolescentes/i, nombre: "adolescentes" },
      { patron: /aventura/i, nombre: "aventura" },
      { patron: /armonia ?10|armonia ?diez/i, nombre: "armonia 10" }
    ];
    
    // Verificar si el término de búsqueda corresponde a un artista popular
    const artistaEncontrado = artistasPopulares.find(artista => artista.patron.test(termino));
    const esArtistaespecial = !!artistaEncontrado;
    
    // Realizar búsqueda en la base de datos
    let canciones = [];
    
    if (esArtistaespecial) {
      const nombreArtista = artistaEncontrado.nombre;
      logger.info(`Búsqueda especial por artista: ${nombreArtista} (búsqueda original: ${termino})`);
      
      // Crear condiciones de búsqueda para el artista
      const condicionesArtista = [];
      
      // Dividir el nombre del artista en partes para mejorar la búsqueda
      const palabrasArtista = nombreArtista.split(' ');
      
      // Para artistas con nombres compuestos como "Grupo 5" o "Armonia 10", buscar cada parte
      for (const palabra of palabrasArtista) {
        if (palabra.length > 1 && !['la', 'el', 'los', 'y', 'de'].includes(palabra)) {
          condicionesArtista.push(
            { nombre: { [Op.like]: `%${palabra}%` } },
            { artista: { [Op.like]: `%${palabra}%` } },
            { ruta_archivo: { [Op.like]: `%${palabra}%` } }
          );
        }
      }
      
      // Si el nombre tiene varias palabras, buscar también la frase completa
      if (palabrasArtista.length > 1) {
        condicionesArtista.push(
          { nombre: { [Op.like]: `%${nombreArtista}%` } },
          { artista: { [Op.like]: `%${nombreArtista}%` } },
          { ruta_archivo: { [Op.like]: `%${nombreArtista}%` } }
        );
      }
      
      // Realizar la búsqueda con todas las condiciones
      canciones = await Cancion.findAll({
        where: {
          [Op.or]: condicionesArtista
        },
        order: [
          ['id', 'DESC'] // Mostrar las más recientes primero
        ],
        limit: 30
      });
      
      if (canciones.length > 0) {
        logger.info(`Búsqueda especial encontró ${canciones.length} canciones de ${nombreArtista.toUpperCase()}`);
        return canciones;
      }
    }
    
    // Si la búsqueda especial no encuentra resultados o no es un artista especial, intentar con el procedimiento almacenado
    try {
      const result = await sequelize.query(
        'CALL buscar_canciones(:termino)',
        {
          replacements: { termino },
          type: sequelize.QueryTypes.RAW
        }
      );
      
      if (result[0] && result[0].length > 0) {
        return result[0];
      }
    } catch (procError) {
      logger.warn(`Error en procedimiento almacenado: ${procError.message}. Usando búsqueda alternativa.`);
    }
    
    // Búsqueda avanzada usando cada palabra clave por separado
    if (palabrasClave.length > 0) {
      const condiciones = [];
      
      // Crear condición para cada palabra clave
      for (const palabra of palabrasClave) {
        if (palabra.length > 2) { // Solo palabras con más de 2 caracteres
          condiciones.push({
            [Op.or]: [
              { nombre: { [Op.like]: `%${palabra}%` } },
              { artista: { [Op.like]: `%${palabra}%` } },
              { ruta_archivo: { [Op.like]: `%${palabra}%` } },
            ]
          });
        }
      }
      
      if (condiciones.length > 0) {
        canciones = await Cancion.findAll({
          where: {
            [Op.and]: condiciones
          },
          limit: 30
        });
        
        if (canciones.length > 0) {
          logger.info(`Búsqueda por palabras clave encontró ${canciones.length} canciones`);
          return canciones;
        }
      }
    }
    
    // Si aún no hay resultados, hacer búsqueda genérica
    canciones = await Cancion.findAll({
      where: {
        [Op.or]: [
          { nombre: { [Op.like]: `%${termino}%` } },
          { artista: { [Op.like]: `%${termino}%` } },
          { album: { [Op.like]: `%${termino}%` } },
          { ruta_archivo: { [Op.like]: `%${termino}%` } }
        ]
      },
      limit: 30
    });
    
    return canciones;
  } catch (error) {
    logger.error(`Error al buscar canciones: ${error.message}`);
    // Fallback genérico en caso de error
    try {
      const canciones = await Cancion.findAll({
        where: {
          [Op.or]: [
            { nombre: { [Op.like]: `%${searchTerm}%` } },
            { artista: { [Op.like]: `%${searchTerm}%` } },
            { album: { [Op.like]: `%${searchTerm}%` } },
            { ruta_archivo: { [Op.like]: `%${searchTerm}%` } }
          ]
        },
        limit: 30
      });
      
      return canciones;
    } catch (fallbackError) {
      logger.error(`Error en búsqueda fallback: ${fallbackError.message}`);
      return [];
    }
  }
};

/**
 * Obtiene una canción por su ID
 * @param {number} id - ID de la canción
 * @returns {Promise<Object|null>} Canción encontrada o null
 */
const obtenerCancionPorId = async (id) => {
  try {
    return await Cancion.findByPk(id);
  } catch (error) {
    logger.error(`Error al obtener canción con ID ${id}: ${error.message}`);
    return null;
  }
};

/**
 * Registra una nueva canción en la base de datos
 * @param {Object} datos - Datos de la canción
 * @returns {Promise<Object>} Canción creada
 */
const registrarCancion = async (datos) => {
  try {
    const nuevaCancion = await Cancion.create(datos);
    logger.info(`Nueva canción registrada: ${datos.nombre} (ID: ${nuevaCancion.id})`);
    return nuevaCancion;
  } catch (error) {
    logger.error(`Error al registrar canción: ${error.message}`);
    throw error;
  }
};

/**
 * Actualiza los datos de una canción
 * @param {number} id - ID de la canción
 * @param {Object} datos - Nuevos datos
 * @returns {Promise<Object|null>} Canción actualizada o null
 */
const actualizarCancion = async (id, datos) => {
  try {
    const cancion = await Cancion.findByPk(id);
    if (!cancion) return null;
    
    await cancion.update(datos);
    logger.info(`Canción actualizada: ${cancion.nombre} (ID: ${cancion.id})`);
    return cancion;
  } catch (error) {
    logger.error(`Error al actualizar canción con ID ${id}: ${error.message}`);
    throw error;
  }
};

/**
 * Elimina una canción y su archivo asociado
 * @param {number} id - ID de la canción
 * @returns {Promise<boolean>} true si se eliminó, false si no
 */
const eliminarCancion = async (id) => {
  try {
    const cancion = await Cancion.findByPk(id);
    if (!cancion) return false;
    
    // Eliminar archivo si existe
    const filePath = path.resolve(process.env.MP3_FOLDER || './mp3', cancion.ruta_archivo);
    if (await fs.exists(filePath)) {
      await fs.unlink(filePath);
    }
    
    // Eliminar de la base de datos
    await cancion.destroy();
    logger.info(`Canción eliminada: ${cancion.nombre} (ID: ${cancion.id})`);
    return true;
  } catch (error) {
    logger.error(`Error al eliminar canción con ID ${id}: ${error.message}`);
    return false;
  }
};

module.exports = {
  buscarCanciones,
  obtenerCancionPorId,
  registrarCancion,
  actualizarCancion,
  eliminarCancion
};
