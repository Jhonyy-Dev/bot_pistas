/**
 * Script para ejecutar mantenimiento manual de la base de datos
 * Ejecuta el procedimiento almacenado mantenimiento_db
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');
const logger = require('../src/config/logger');

async function ejecutarMantenimiento() {
  try {
    logger.info('Iniciando mantenimiento manual de la base de datos...');
    
    // Ejecutar el procedimiento almacenado
    await sequelize.query('CALL mantenimiento_db()', {
      type: sequelize.QueryTypes.RAW
    });
    
    logger.info('Mantenimiento de base de datos completado exitosamente');
    process.exit(0);
  } catch (error) {
    logger.error(`Error durante el mantenimiento de la base de datos: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar mantenimiento
ejecutarMantenimiento();
