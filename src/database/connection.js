const { Sequelize } = require('sequelize');
const config = require('./config');
require('dotenv').config();

// Determinar el entorno de ejecución
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Crear una instancia de Sequelize con configuración optimizada para alto volumen
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions,
    logging: dbConfig.logging,
    define: dbConfig.define,
    query: dbConfig.query,
    // Opciones adicionales para optimizar rendimiento con 250,000+ archivos
    retry: {
      max: 5,                     // Número máximo de reintentos para consultas fallidas
      match: [
        /Deadlock/i,              // Reintentar en caso de deadlocks
        /Lock wait timeout/i,     // Reintentar en caso de timeout de bloqueo
        /Connection lost/i        // Reintentar en caso de pérdida de conexión
      ],
      backoffBase: 100,           // Tiempo base entre reintentos (ms)
      backoffExponent: 1.1        // Factor de crecimiento exponencial para backoff
    }
  }
);

// Función para probar la conexión
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión a la base de datos establecida correctamente.');
    return true;
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    return false;
  }
};

// Función para cerrar la conexión
const closeConnection = async () => {
  try {
    await sequelize.close();
    console.log('Conexión a la base de datos cerrada correctamente.');
    return true;
  } catch (error) {
    console.error('Error al cerrar la conexión con la base de datos:', error);
    return false;
  }
};

// Función para ejecutar procedimientos almacenados optimizados
const callStoredProcedure = async (procedureName, params = []) => {
  try {
    // Construir la llamada al procedimiento almacenado con parámetros
    const placeholders = params.map(() => '?').join(',');
    const query = `CALL ${procedureName}(${placeholders})`;
    
    // Ejecutar el procedimiento con manejo de transacción
    const [results] = await sequelize.query(query, {
      replacements: params,
      type: Sequelize.QueryTypes.RAW,
      // Usar una transacción para garantizar consistencia
      transaction: await sequelize.transaction()
    });
    
    return results;
  } catch (error) {
    console.error(`Error al ejecutar el procedimiento ${procedureName}:`, error);
    throw error;
  }
};

// Función para buscar canciones usando el procedimiento optimizado con caché
const buscarCanciones = async (termino, limite = 10, usarCache = true) => {
  try {
    return await callStoredProcedure('buscar_canciones_cache', [termino, limite, usarCache]);
  } catch (error) {
    console.error('Error en búsqueda de canciones:', error);
    throw error;
  }
};

// Función para registrar descarga usando el procedimiento optimizado
const registrarDescarga = async (idUsuario, idCancion, origen) => {
  try {
    return await callStoredProcedure('registrar_descarga', [idUsuario, idCancion, origen]);
  } catch (error) {
    // Manejar específicamente el error de créditos insuficientes
    if (error.message && error.message.includes('Créditos insuficientes')) {
      throw new Error('Créditos insuficientes para realizar la descarga');
    }
    console.error('Error al registrar descarga:', error);
    throw error;
  }
};

// Función para ejecutar mantenimiento de la base de datos
const ejecutarMantenimiento = async () => {
  try {
    return await callStoredProcedure('mantenimiento_db', []);
  } catch (error) {
    console.error('Error al ejecutar mantenimiento:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection,
  closeConnection,
  callStoredProcedure,
  buscarCanciones,
  registrarDescarga,
  ejecutarMantenimiento
};
