const { sequelize } = require('../config/database');
const { Usuario, Cancion, TransaccionCredito, Descarga } = require('../database/models');
const logger = require('../config/logger');

/**
 * Agrega créditos a un usuario
 * @param {string} numeroTelefono - Número de teléfono del usuario
 * @param {number} cantidad - Cantidad de créditos a agregar
 * @param {string} tipo - Tipo de transacción ('compra', 'regalo', 'promocion')
 * @param {string} descripcion - Descripción de la transacción
 * @returns {Promise<boolean>} true si se agregaron los créditos, false si no
 */
const agregarCredito = async (numeroTelefono, cantidad, tipo, descripcion) => {
  const transaction = await sequelize.transaction();
  
  try {
    logger.info(`Intentando agregar ${cantidad} créditos a ${numeroTelefono} (${tipo}: ${descripcion})`);
    
    // Método directo usando Sequelize (sin procedimiento almacenado)
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono },
      transaction
    });
    
    if (!usuario) {
      logger.error(`Usuario no encontrado: ${numeroTelefono}`);
      await transaction.rollback();
      return false;
    }
    
    // Obtener créditos actuales para log
    const creditosAntes = usuario.creditos;
    
    // Actualizar créditos del usuario con un valor exacto
    await Usuario.update(
      { creditos: sequelize.literal(`creditos + ${cantidad}`) },
      { 
        where: { numero_telefono: numeroTelefono },
        transaction 
      }
    );
    
    // Registrar la transacción
    await TransaccionCredito.create({
      id_usuario: usuario.id,
      cantidad,
      tipo,
      descripcion
    }, { transaction });
    
    // Verificar que los créditos se actualizaron correctamente
    const usuarioActualizado = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono },
      transaction
    });
    
    const creditosDespues = usuarioActualizado.creditos;
    
    logger.info(`Créditos actualizados para ${numeroTelefono}: ${creditosAntes} -> ${creditosDespues} (agregados: ${cantidad})`);
    
    await transaction.commit();
    return true;
  } catch (error) {
    logger.error(`Error al agregar créditos a ${numeroTelefono}: ${error.message}`);
    await transaction.rollback();
    return false;
  }
};

/**
 * Descuenta un crédito de un usuario y registra la descarga
 * @param {string} numeroTelefono - Número de teléfono del usuario
 * @param {number} idCancion - ID de la canción descargada
 * @returns {Promise<boolean>} true si se descontó el crédito, false si no
 */
const descontarCredito = async (numeroTelefono, idCancion) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Primero obtenemos el ID del usuario
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono },
      transaction
    });
    
    if (!usuario) {
      logger.error(`Usuario no encontrado: ${numeroTelefono}`);
      await transaction.rollback();
      return false;
    }
    
    // Intentar usar el procedimiento almacenado optimizado
    try {
      // El procedimiento almacenado optimizado requiere id_usuario, id_cancion y origen
      const [results] = await sequelize.query(
        'CALL registrar_descarga(?, ?, ?)',
        {
          replacements: [
            usuario.id,         // ID del usuario (no el número de teléfono)
            idCancion,          // ID de la canción
            'app'               // Origen de la descarga
          ],
          type: sequelize.QueryTypes.RAW,
          transaction
        }
      );
      
      // El procedimiento devuelve un resultado si fue exitoso
      if (results && results.length > 0) {
        await transaction.commit();
        logger.info(`Crédito descontado de ${numeroTelefono} por descarga de canción ID: ${idCancion}`);
        return true;
      }
    } catch (error) {
      // Si el error es por créditos insuficientes, manejarlo específicamente
      if (error.message && error.message.includes('Créditos insuficientes')) {
        logger.warn(`Créditos insuficientes para usuario ${numeroTelefono}`);
        await transaction.rollback();
        return false;
      }
      
      // Si falla el procedimiento almacenado por otra razón, continuar con el método alternativo
      logger.warn(`Error en procedimiento registrar_descarga: ${error.message}. Usando método alternativo.`);
    }
    
    // Método alternativo usando Sequelize
    // Verificar si el usuario tiene suficientes créditos
    if (!usuario || usuario.creditos < 1) {
      await transaction.rollback();
      return false;
    }
    
    const cancion = await Cancion.findByPk(idCancion, { transaction });
    if (!cancion) {
      await transaction.rollback();
      return false;
    }
    
    // Descontar crédito
    await usuario.decrement('creditos', { by: 1, transaction });
    
    // Registrar descarga
    await Descarga.create({
      id_usuario: usuario.id,
      id_cancion: cancion.id
    }, { transaction });
    
    // Registrar transacción de crédito
    await TransaccionCredito.create({
      id_usuario: usuario.id,
      cantidad: -1,
      tipo: 'uso',
      descripcion: `Descarga de canción: ${cancion.nombre}`
    }, { transaction });
    
    await transaction.commit();
    logger.info(`Crédito descontado de ${numeroTelefono} por descarga de canción ID: ${idCancion}`);
    return true;
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error al descontar crédito de ${numeroTelefono}: ${error.message}`);
    return false;
  }
};

/**
 * Obtiene el balance de créditos de un usuario
 * @param {string} numeroTelefono - Número de teléfono del usuario
 * @returns {Promise<number|null>} Cantidad de créditos o null si no existe el usuario
 */
const obtenerCreditos = async (numeroTelefono) => {
  try {
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono }
    });
    
    return usuario ? usuario.creditos : null;
  } catch (error) {
    logger.error(`Error al obtener créditos de ${numeroTelefono}: ${error.message}`);
    return null;
  }
};

/**
 * Obtiene el historial de transacciones de créditos de un usuario
 * @param {string} numeroTelefono - Número de teléfono del usuario
 * @returns {Promise<Array|null>} Historial de transacciones o null si hay error
 */
const obtenerHistorialTransacciones = async (numeroTelefono) => {
  try {
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono }
    });
    
    if (!usuario) return null;
    
    const transacciones = await TransaccionCredito.findAll({
      where: { id_usuario: usuario.id },
      order: [['fecha_transaccion', 'DESC']],
      limit: 20
    });
    
    return transacciones;
  } catch (error) {
    logger.error(`Error al obtener historial de transacciones de ${numeroTelefono}: ${error.message}`);
    return null;
  }
};

module.exports = {
  agregarCredito,
  descontarCredito,
  obtenerCreditos,
  obtenerHistorialTransacciones
};
