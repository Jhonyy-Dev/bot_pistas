/**
 * Configuración de Backblaze B2 para BOT_PISTAS
 * Este archivo configura la conexión a Backblaze B2 usando AWS SDK para S3
 */

require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');

// Middleware para eliminar cabeceras incompatibles
const removeIncompatibleHeaders = (next) => async (args) => {
  if (args.request && args.request.headers) {
    // Eliminar todas las cabeceras de checksum incompatibles con Backblaze B2
    delete args.request.headers['x-amz-checksum-mode'];
    delete args.request.headers['x-amz-content-sha256'];
    delete args.request.headers['x-amz-checksum-crc32'];
    delete args.request.headers['x-amz-checksum-crc32c'];
    delete args.request.headers['x-amz-checksum-sha1'];
    delete args.request.headers['x-amz-checksum-sha256'];
  }
  return next(args);
};

// Crear cliente S3 para Backblaze B2
const s3Client = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY,
    secretAccessKey: process.env.B2_SECRET_KEY
  },
  forcePathStyle: true // Importante para Backblaze B2
});

// Agregar middleware para eliminar cabeceras incompatibles
s3Client.middlewareStack.add(removeIncompatibleHeaders, {
  step: 'build',
  priority: 'high'
});

module.exports = s3Client;
