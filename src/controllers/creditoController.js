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
    // Intentar usar el procedimiento almacenado
    try {
      const [results] = await sequelize.query(
        'CALL agregar_creditos(:numero_telefono, :cantidad, :tipo, :descripcion, @p_exito)',
        {
          replacements: {
            numero_telefono: numeroTelefono,
            cantidad,
            tipo,
            descripcion
          },
          transaction
        }
      );
      
      const exito = results && results[0] && results[0].p_exito;
      
      if (exito) {
        await transaction.commit();
        logger.info(`Créditos agregados a ${numeroTelefono}: ${cantidad} (${tipo})`);
        return true;
      }
    } catch (error) {
      // Si falla el procedimiento almacenado, continuar con el método alternativo
      logger.warn(`Error en procedimiento agregar_creditos: ${error.message}. Usando método alternativo.`);
    }
    
    // Método alternativo usando Sequelize
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono },
      transaction
    });
    
    if (!usuario) {
      await transaction.rollback();
      return false;
    }
    
    // Actualizar créditos del usuario
    await usuario.increment('creditos', {
      by: cantidad,
      transaction
    });
    
    // Registrar la transacción
    await TransaccionCredito.create({
      id_usuario: usuario.id,
      cantidad,
      tipo,
      descripcion
    }, { transaction });
    
    await transaction.commit();
    logger.info(`Créditos agregados a ${numeroTelefono}: ${cantidad} (${tipo})`);
    return true;
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error al agregar créditos a ${numeroTelefono}: ${error.message}`);
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
    // Intentar usar el procedimiento almacenado
    try {
      const [results] = await sequelize.query(
        'CALL registrar_descarga(:numero_telefono, :id_cancion, @p_exito)',
        {
          replacements: {
            numero_telefono: numeroTelefono,
            id_cancion: idCancion
          },
          transaction
        }
      );
      
      const exito = results && results[0] && results[0].p_exito;
      
      if (exito) {
        await transaction.commit();
        logger.info(`Crédito descontado de ${numeroTelefono} por descarga de canción ID: ${idCancion}`);
        return true;
      }
    } catch (error) {
      // Si falla el procedimiento almacenado, continuar con el método alternativo
      logger.warn(`Error en procedimiento registrar_descarga: ${error.message}. Usando método alternativo.`);
    }
    
    // Método alternativo usando Sequelize
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono },
      transaction
    });
    
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
