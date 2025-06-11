/**
 * Servicio de mantenimiento automático de la base de datos
 * Ejecuta el procedimiento almacenado mantenimiento_db periódicamente
 */
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

// Intervalo en milisegundos (24 horas = 86400000 ms)
const MAINTENANCE_INTERVAL = 86400000;

/**
 * Ejecuta el procedimiento almacenado de mantenimiento
 * @returns {Promise<boolean>} true si se ejecutó correctamente, false si hubo error
 */
const ejecutarMantenimiento = async () => {
  try {
    logger.info('Iniciando mantenimiento programado de la base de datos...');
    
    // Ejecutar el procedimiento almacenado
    await sequelize.query('CALL mantenimiento_db()', {
      type: sequelize.QueryTypes.RAW
    });
    
    logger.info('Mantenimiento de base de datos completado exitosamente');
    return true;
  } catch (error) {
    logger.error(`Error durante el mantenimiento de la base de datos: ${error.message}`);
    return false;
  }
};

/**
 * Inicia el servicio de mantenimiento automático
 */
const iniciarServicioMantenimiento = () => {
  logger.info(`Servicio de mantenimiento programado cada ${MAINTENANCE_INTERVAL / 3600000} horas`);
  
  // Ejecutar mantenimiento al iniciar
  ejecutarMantenimiento().then(success => {
    if (success) {
      logger.info('Mantenimiento inicial completado');
    } else {
      logger.warn('El mantenimiento inicial no pudo completarse');
    }
  });
  
  // Programar ejecución periódica
  setInterval(async () => {
    await ejecutarMantenimiento();
  }, MAINTENANCE_INTERVAL);
};

module.exports = {
  iniciarServicioMantenimiento,
  ejecutarMantenimiento
};
