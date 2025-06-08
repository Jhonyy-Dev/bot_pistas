const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('./logger');

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Función para testear la conexión
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Conexión a la base de datos establecida correctamente.');
    return true;
  } catch (error) {
    logger.error('Error al conectar con la base de datos:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection
};
