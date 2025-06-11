require('dotenv').config();

// Configuración optimizada para alto volumen de datos y consultas concurrentes
module.exports = {
  development: {
    username: process.env.DB_USER || 'u487652187_bot_pistas',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'u487652187_bot_pistas',
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    // Configuraciones para optimizar rendimiento con alto volumen de datos
    pool: {
      max: 25,                    // Máximo de conexiones en el pool
      min: 5,                     // Mínimo de conexiones en el pool
      acquire: 60000,             // Tiempo máximo para adquirir conexión (ms)
      idle: 10000,                // Tiempo máximo que una conexión puede estar inactiva (ms)
      evict: 1000                 // Frecuencia de comprobación de conexiones inactivas (ms)
    },
    dialectOptions: {
      connectTimeout: 60000,      // Tiempo de espera para conexión (ms)
      // Opciones para consultas grandes
      options: {
        requestTimeout: 300000    // Tiempo de espera para consultas (ms)
      },
      // Configuración para SSL si es necesario
      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false // Para desarrollo, en producción debe ser true
      } : false
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: {
      timestamps: false,          // No usar timestamps automáticos
      underscored: true,          // Usar snake_case para nombres de columnas
      freezeTableName: true       // No pluralizar nombres de tablas
    },
    // Configuraciones para optimizar consultas
    query: {
      raw: false                  // No devolver resultados en formato raw por defecto
    }
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: 'mysql',
    // Configuraciones para optimizar rendimiento con alto volumen de datos
    pool: {
      max: 50,                    // Más conexiones para producción
      min: 10,                    // Mínimo de conexiones en el pool
      acquire: 60000,             // Tiempo máximo para adquirir conexión (ms)
      idle: 10000,                // Tiempo máximo que una conexión puede estar inactiva (ms)
      evict: 1000                 // Frecuencia de comprobación de conexiones inactivas (ms)
    },
    dialectOptions: {
      connectTimeout: 60000,      // Tiempo de espera para conexión (ms)
      // Opciones para consultas grandes
      options: {
        requestTimeout: 300000    // Tiempo de espera para consultas (ms)
      },
      // Configuración para SSL en producción
      ssl: {
        rejectUnauthorized: true  // Validar certificados SSL en producción
      }
    },
    logging: false,               // Desactivar logging en producción
    define: {
      timestamps: false,          // No usar timestamps automáticos
      underscored: true,          // Usar snake_case para nombres de columnas
      freezeTableName: true       // No pluralizar nombres de tablas
    },
    // Configuraciones para optimizar consultas
    query: {
      raw: false                  // No devolver resultados en formato raw por defecto
    }
  }
};
