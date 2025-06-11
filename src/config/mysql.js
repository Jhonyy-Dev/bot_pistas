/**
 * Configuración de conexión directa a MySQL para BOT_PISTAS
 * Permite ejecutar procedimientos almacenados y consultas SQL complejas
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('./logger');

// Configuración de la conexión
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: process.env.DB_SSL === 'true' ? {
    // Configuración SSL básica
    rejectUnauthorized: false
  } : undefined,
  charset: 'utf8mb4',
  timezone: '+00:00',
  connectTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 60000,
  waitForConnections: true
};

// Crear pool de conexiones para mejor rendimiento
const pool = mysql.createPool({
  ...dbConfig,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Ejecuta una consulta SQL con parámetros
 * @param {string} sql - Consulta SQL
 * @param {Array} [params=[]] - Parámetros para la consulta
 * @returns {Promise<Array>} - Resultado de la consulta
 */
async function execute(sql, params = []) {
  try {
    const result = await pool.execute(sql, params);
    return result;
  } catch (error) {
    logger.error(`Error ejecutando SQL: ${sql}`, error);
    throw error;
  }
}

/**
 * Prueba la conexión a la base de datos
 * @returns {Promise<boolean>} - true si la conexión es exitosa
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    logger.info('Conexión a MySQL establecida correctamente');
    connection.release();
    return true;
  } catch (error) {
    logger.error('Error conectando a MySQL:', error);
    return false;
  }
}

/**
 * Ejecuta una transacción con múltiples consultas
 * @param {Function} callback - Función que recibe la conexión y ejecuta las consultas
 * @returns {Promise<any>} - Resultado de la transacción
 */
async function transaction(callback) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  execute,
  testConnection,
  transaction,
  pool
};
