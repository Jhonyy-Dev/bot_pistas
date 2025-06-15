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
 * Lista archivos en el bucket con un prefijo específico con soporte completo de paginación
 * @param {string} [prefix=''] - Prefijo para filtrar archivos
 * @param {number} [maxItems=10000] - Número máximo de items a devolver en total
 * @returns {Promise<Array>} - Lista completa de objetos combinando todas las páginas
 */
async function listarArchivos(prefix = '', maxItems = 10000) {
  try {
    if (!process.env.B2_BUCKET_NAME) {
      console.log('❌ B2_BUCKET_NAME no está configurado');
      return [];
    }
    
    console.log(`📂 Listando archivos en bucket: ${process.env.B2_BUCKET_NAME}, prefijo: "${prefix}", max: ${maxItems}`);
    
    // Array para almacenar todos los archivos de todas las páginas
    let todosLosArchivos = [];
    
    // Parámetros iniciales para la primera página
    let params = {
      Bucket: process.env.B2_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 1000 // Máximo por página permitido por Backblaze
    };
    
    // Variable para controlar si hay más páginas
    let hayMásPáginas = true;
    // Número de página actual para logging
    let numeroPagina = 1;
    
    // Obtener todas las páginas hasta llegar al límite o no haber más archivos
    while (hayMásPáginas && todosLosArchivos.length < maxItems) {
      console.log(`🔍 Obteniendo página ${numeroPagina} de archivos...`);
      console.log(`🔍 Parámetros de búsqueda:`, params);
      
      // Obtener la página actual
      const response = await s3Client.send(new ListObjectsV2Command(params));
      
      console.log(`📊 Respuesta de Backblaze - Página ${numeroPagina} - Truncated: ${response.IsTruncated}, Count: ${response.KeyCount}, Contents length: ${response.Contents?.length || 0}`);
      
      // Agregar los archivos de esta página al resultado total
      if (response.Contents && response.Contents.length > 0) {
        todosLosArchivos = [...todosLosArchivos, ...response.Contents];
        console.log(`⏭️ Archivos acumulados hasta ahora: ${todosLosArchivos.length}`);
      }
      
      // Verificar si hay más páginas
      if (response.IsTruncated && response.NextContinuationToken) {
        // Configurar parámetros para la siguiente página
        params.ContinuationToken = response.NextContinuationToken;
        numeroPagina++;
      } else {
        // No hay más páginas
        hayMásPáginas = false;
      }
      
      // Verificar si ya alcanzamos el límite máximo
      if (todosLosArchivos.length >= maxItems) {
        console.log(`⚠️ Alcanzado límite máximo de ${maxItems} archivos. Truncando resultados.`);
        hayMásPáginas = false;
      }
    }
    
    console.log(`💾 Total de archivos obtenidos de todas las páginas: ${todosLosArchivos.length}`);
    
    if (todosLosArchivos.length === 0) {
      console.log('📭 No se encontraron archivos en Backblaze B2');
      return [];
    }
    
    // Usar la lista acumulada de todas las páginas (todosLosArchivos) en lugar de solo la última respuesta
    const archivos = todosLosArchivos
      .filter(obj => obj.Key && obj.Key.toLowerCase().endsWith('.mp3'))
      .map(obj => ({
        nombre: obj.Key,
        tamaño: obj.Size,
        fechaModificacion: obj.LastModified,
        etag: obj.ETag
      }));
    
    console.log(`🎵 Archivos MP3 filtrados: ${archivos.length}`);
    
    return archivos;
  } catch (error) {
    console.error('❌ Error al listar archivos de Backblaze B2:', error.message);
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
