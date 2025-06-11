/**
 * Servicio para interactuar con Backblaze B2
 * Proporciona funciones para descargar, listar y gestionar archivos MP3
 */

const { 
  GetObjectCommand, 
  ListObjectsV2Command,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/backblaze.js');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { createWriteStream } = require('fs');
const pipeline = promisify(require('stream').pipeline);

/**
 * Descarga un archivo MP3 desde Backblaze B2 al sistema de archivos local
 * @param {string} archivoPath - Ruta del archivo en B2
 * @param {string} [outputDir] - Directorio de salida (opcional, por defecto usa MP3_FOLDER del .env)
 * @returns {Promise<Buffer>} - Buffer con el contenido del archivo
 */
async function descargarMp3(archivoPath, outputDir = null) {
  // Usar el directorio configurado en .env o el proporcionado
  const tempDir = outputDir || path.join(process.cwd(), process.env.MP3_FOLDER || 'temp');
  
  // Crear directorio si no existe
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Generar nombre de archivo único para evitar colisiones
  const tempFilePath = path.join(tempDir, `${Date.now()}_${path.basename(archivoPath)}`);
  
  try {
    // Configurar un timeout para la operación completa
    const timeoutMs = 10000; // 10 segundos máximo para la descarga
    
    // En lugar de usar GetObjectCommand directamente, usamos una URL firmada
    // y descargamos con un cliente HTTP estándar para evitar problemas de checksums
    const command = new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: archivoPath
    });
    
    // Generar URL firmada (con menor tiempo de expiración para optimizar)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 30 });
    
    // Usar fetch para descargar el archivo
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      // Determinar qué cliente HTTP usar basado en la URL
      const client = signedUrl.startsWith('https:') ? https : http;
      
      // Configurar timeout para la solicitud HTTP
      const timeoutId = setTimeout(() => {
        request.abort();
        reject(new Error('Timeout al descargar el archivo'));
      }, timeoutMs);
      
      // Crear un stream de escritura para el archivo
      const fileStream = fs.createWriteStream(tempFilePath);
      
      // Hacer la solicitud HTTP con opciones optimizadas
      const options = new URL(signedUrl);
      options.timeout = timeoutMs;
      options.headers = {
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate'
      };
      
      const request = client.get(options, (response) => {
        if (response.statusCode !== 200) {
          clearTimeout(timeoutId);
          reject(new Error(`Error al descargar archivo: ${response.statusCode}`));
          return;
        }
        
        // Recolectar el buffer para devolverlo junto con la ruta del archivo
        const chunks = [];
        
        response.on('data', (chunk) => {
          chunks.push(chunk);
          fileStream.write(chunk);
        });
        
        response.on('end', () => {
          clearTimeout(timeoutId);
          fileStream.end();
          console.log(`Archivo descargado: ${tempFilePath}`);
          
          // Crear un buffer con los chunks recibidos
          const buffer = Buffer.concat(chunks);
          
          // Resolver con el buffer directamente, no con un objeto
          resolve(buffer);
        });
      });
      
      request.on('error', (err) => {
        clearTimeout(timeoutId);
        fs.unlink(tempFilePath, () => {}); // Eliminar archivo parcial
        reject(err);
      });
      
      fileStream.on('error', (err) => {
        clearTimeout(timeoutId);
        fs.unlink(tempFilePath, () => {}); // Eliminar archivo parcial
        reject(err);
      });
      
      // Establecer prioridad alta para la solicitud
      if (request.setNoDelay) request.setNoDelay(true);
    });
    
  } catch (error) {
    console.error('Error descargando archivo desde B2:', error);
    throw error;
  }
}

/**
 * Genera una URL firmada temporal para acceder directamente al archivo
 * @param {string} archivoPath - Ruta del archivo en B2
 * @param {number} [expiresIn=3600] - Tiempo de expiración en segundos (1 hora por defecto)
 * @returns {Promise<string>} - URL firmada
 */
async function generarUrlFirmada(archivoPath, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: archivoPath
    });
    
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Error generando URL firmada:', error);
    throw error;
  }
}

/**
 * Verifica si un archivo existe en el bucket
 * @param {string} archivoPath - Ruta del archivo en B2
 * @returns {Promise<boolean>} - true si existe, false si no
 */
async function verificarArchivoExiste(archivoPath) {
  try {
    const command = new HeadObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: archivoPath
    });
    
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    console.error('Error verificando archivo en B2:', error);
    throw error;
  }
}

/**
 * Lista archivos en el bucket con un prefijo específico
 * @param {string} [prefix=''] - Prefijo para filtrar archivos
 * @param {number} [maxItems=1000] - Número máximo de items a devolver
 * @returns {Promise<Array>} - Lista de objetos
 */
async function listarArchivos(prefix = '', maxItems = 1000) {
  try {
    // Verificar que el cliente S3 esté configurado correctamente
    if (!s3Client) {
      throw new Error('Cliente S3 no inicializado');
    }
    
    // Verificar que el bucket esté configurado
    if (!process.env.B2_BUCKET_NAME) {
      throw new Error('Nombre del bucket no configurado en variables de entorno');
    }
    
    console.log(`Listando archivos en bucket: ${process.env.B2_BUCKET_NAME}, prefijo: "${prefix}", max: ${maxItems}`);
    
    const command = new ListObjectsV2Command({
      Bucket: process.env.B2_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxItems
    });
    
    const response = await s3Client.send(command);
    
    // Verificar la respuesta
    if (!response) {
      throw new Error('Respuesta vacía de Backblaze B2');
    }
    
    console.log(`Respuesta de B2: ${JSON.stringify(response, null, 2)}`);
    
    // Asegurarse de que Contents sea un array, incluso si está vacío
    const contents = response.Contents || [];
    console.log(`Se encontraron ${contents.length} archivos en Backblaze B2`);
    
    return contents;
  } catch (error) {
    console.error(`Error listando archivos de B2: ${error.message}`);
    console.error(error.stack);
    // En lugar de lanzar el error, devolver un array vacío para evitar errores en cascada
    return [];
  }
}

/**
 * Obtiene información sobre un archivo específico
 * @param {string} archivoPath - Ruta del archivo en B2
 * @returns {Promise<Object>} - Metadatos del archivo
 */
async function obtenerInfoArchivo(archivoPath) {
  try {
    const command = new HeadObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: archivoPath
    });
    
    const response = await s3Client.send(command);
    return {
      tamanio: response.ContentLength,
      tipo: response.ContentType,
      ultimaModificacion: response.LastModified,
      metadata: response.Metadata
    };
  } catch (error) {
    console.error('Error obteniendo información del archivo:', error);
    throw error;
  }
}

module.exports = {
  descargarMp3,
  generarUrlFirmada,
  verificarArchivoExiste,
  listarArchivos,
  obtenerInfoArchivo
};
