const winston = require('winston');
const path = require('path');
const dotenv = require('dotenv');
const util = require('util');

dotenv.config();

// Define niveles de log personalizados
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Función mejorada para formatear cualquier tipo de objeto a string
 * Garantiza que nunca se muestre [object Object] en los logs
 */
const formatearMensaje = (mensaje) => {
  if (mensaje === null || mensaje === undefined) {
    return String(mensaje);
  }
  
  if (typeof mensaje === 'string') {
    return mensaje;
  }
  
  if (mensaje instanceof Error) {
    return `Error: ${mensaje.message}\nStack: ${mensaje.stack || ''}`;
  }
  
  try {
    // Usar util.inspect para una mejor representación de objetos
    return util.inspect(mensaje, { 
      depth: 3, 
      colors: false, 
      maxArrayLength: 100,
      breakLength: 120
    });
  } catch (err) {
    // En caso de error al serializar
    return `[Error al serializar objeto: ${err.message}]`;
  }
};

// Creamos el formato para todos los transportes
const formatoPersonalizado = winston.format.printf(({ timestamp, level, message }) => {
  const mensajeFormateado = formatearMensaje(message);
  return `${timestamp} ${level}: ${mensajeFormateado}`;
});

// Crear el logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  exitOnError: false, // No cerrar en caso de error
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    formatoPersonalizado
  ),
  transports: [
    // Formato para consola con colores
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        formatoPersonalizado
      ),
    }),
    // Archivos de log separados por nivel
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Agregar colores
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  trace: 'gray',
});

// Reemplazar métodos estándar para garantizar serialización correcta
const métodosOriginales = ['error', 'warn', 'info', 'debug', 'trace'];

métodosOriginales.forEach(método => {
  const métodoOriginal = logger[método];
  
  // Sobrescribir método para asegurar serialización
  logger[método] = function(...args) {
    if (args.length === 0) {
      return métodoOriginal.call(this, '[Mensaje vacío]');
    }
    
    // Pasar al método original, ya se formateará correctamente
    return métodoOriginal.apply(this, args);
  };
});

module.exports = logger;