/**
 * Servicio para interactuar con Google Drive y descargar archivos MP3
 * Este servicio permite autenticarse con Google Drive, listar archivos y descargarlos
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');
const logger = require('../config/logger');

class GoogleDriveService {
  constructor() {
    // Crear directorio temporal para archivos descargados
    this.tempFolder = path.resolve(os.tmpdir(), 'bot_chiveros_temp');
    fs.ensureDirSync(this.tempFolder);
    
    // Inicializar la conexión a Drive
    this.initializeDrive();
    
    // Programar limpieza periódica de archivos temporales
    setInterval(() => this.cleanupTempFiles(), 30 * 60 * 1000); // Cada 30 minutos
  }

  initializeDrive() {
    try {
      // Ruta al archivo de credenciales
      const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
      
      // Verificar que el archivo existe
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Archivo de credenciales no encontrado en: ${credentialsPath}`);
      }
      
      // Cargar credenciales directamente desde el archivo
      // Esto es importante para preservar el formato exacto de la clave privada
      const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
      const credentials = JSON.parse(credentialsContent);
      
      // Verificar que las credenciales son válidas
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Credenciales incompletas: faltan client_email o private_key');
      }
      
      logger.info(`Usando cuenta de servicio: ${credentials.client_email}`);
      
      // Configurar autenticación con el archivo de credenciales directamente
      // En lugar de pasar la clave privada, usamos el archivo completo
      // Esto soluciona problemas de formato en la clave privada
      this.auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ]
      });
      
      // Obtener el cliente autenticado
      logger.info('Autenticando con Google Drive...');
      return this.auth.getClient()
        .then(authClient => {
          // Crear cliente de Drive con el cliente autenticado
          this.drive = google.drive({ 
            version: 'v3', 
            auth: authClient 
          });
          logger.info('Servicio de Google Drive inicializado correctamente');
        })
        .catch(err => {
          logger.error(`Error en la autorización de Google: ${err.message}`);
          if (err.message.includes('invalid_grant') || err.message.includes('invalid_client')) {
            logger.error('Credenciales inválidas o cuenta de servicio no autorizada.');
            logger.error(`Asegúrate de que has compartido la carpeta con: ${credentials.client_email}`);
          }
          throw err;
        });
    } catch (error) {
      logger.error(`Error al inicializar Google Drive: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lista archivos en una carpeta específica de Google Drive
   * @param {string} folderId - ID de la carpeta
   * @param {string} [pageToken] - Token de paginación para resultados adicionales
   * @param {Array} [allFiles] - Acumulador de archivos encontrados (para recursión)
   * @returns {Promise<Array>} Lista de archivos y carpetas
   */
  async listFiles(folderId = 'root', pageToken = null, allFiles = []) {
    try {
      // Consultar archivos en la carpeta
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageToken: pageToken,
        pageSize: 1000  // Máximo por página
      });
      
      const { files, nextPageToken } = response.data;
      
      // Añadir archivos encontrados al acumulador
      allFiles = [...allFiles, ...files];
      
      logger.info(`Encontrados ${files.length} elementos en carpeta ${folderId}`);
      
      // Procesar siguiente página si existe
      if (nextPageToken) {
        return this.listFiles(folderId, nextPageToken, allFiles);
      }
      
      // Procesar subcarpetas recursivamente
      const folders = files.filter(file => file.mimeType === 'application/vnd.google-apps.folder');
      
      for (const folder of folders) {
        const folderFiles = await this.listFiles(folder.id);
        allFiles = [...allFiles, ...folderFiles];
      }
      
      return allFiles;
    } catch (error) {
      logger.error(`Error al listar archivos de Drive: ${error.message}`);
      throw error;
    }
  }

  /**
   * Descarga un archivo de Google Drive usando su ID
   * @param {string} fileId - ID del archivo a descargar
   * @param {string} [fileName] - Nombre para guardar el archivo (opcional)
   * @returns {Promise<Object>} Objeto con buffer del archivo y ruta temporal
   */
  async downloadFile(fileId, fileName) {
    try {
      // Validar que el ID parece válido antes de hacer cualquier solicitud
      if (!this.validateDriveId(fileId)) {
        throw new Error(`ID de Drive inválido: "${fileId}"`);
      }
      
      logger.info(`Descargando archivo ${fileId} de Google Drive`);
      
      // Verificar explicitamente que el archivo existe antes de intentar descargarlo
      const exists = await this.checkFileExists(fileId);
      if (!exists) {
        throw new Error(`Archivo con ID ${fileId} no encontrado en Google Drive`);
      }
      
      // Generar nombre de archivo temporal único y seguro
      const safeFileName = fileName ? 
        this.sanitizeFileName(fileName) : 
        `${Date.now()}.mp3`;
      const tempFilePath = path.join(this.tempFolder, `${Date.now()}_${safeFileName}`);
      
      // Crear stream para guardar el archivo
      const dest = fs.createWriteStream(tempFilePath);
      
      // Obtener archivo de Google Drive como stream con manejo de errores mejorado
      logger.info(`Iniciando descarga de stream para archivo ID: ${fileId}`);
      
      try {
        const response = await this.drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'stream' }
        );
        
        // Procesar el stream y devolver promesa
        return new Promise((resolve, reject) => {
          let hasError = false;
          
          response.data
            .on('end', async () => {
              if (hasError) return; // Ya manejado por el evento 'error'
              
              try {
                // Verificar que el archivo se descargó correctamente
                const stats = await fs.stat(tempFilePath);
                if (stats.size === 0) {
                  reject(new Error(`Archivo descargado con tamaño 0 bytes`));
                  return;
                }
                
                // Leer el archivo completo a un buffer para enviar por WhatsApp
                const buffer = await fs.readFile(tempFilePath);
                logger.info(`Archivo descargado correctamente: ${fileId}, tamaño: ${buffer.length} bytes`);
                resolve({ buffer, filePath: tempFilePath });
              } catch (err) {
                logger.error(`Error al leer archivo temporal: ${err.message}`);
                reject(err);
              }
            })
            .on('error', err => {
              hasError = true;
              // En caso de error, rechazar la promesa
              logger.error(`Error en el stream de descarga: ${err.message}`);
              fs.unlink(tempFilePath).catch(() => {}); // Eliminar archivo parcial
              reject(err);
            })
            .pipe(dest); // Conectar el stream de Google Drive al archivo local
          
          // Si hay un error en la escritura del archivo local
          dest.on('error', (err) => {
            hasError = true;
            logger.error(`Error al escribir en archivo temporal: ${err.message}`);
            reject(err);
          });
        });
        
      } catch (streamError) {
        logger.error(`Error al obtener stream de Drive: ${streamError.message}`);
        // Propagar errores detallados, especialmente problemas de permisos
        if (streamError.code === 403) {
          throw new Error(`Sin permiso para acceder al archivo con ID ${fileId}`);
        }
        throw streamError;
      }
      
    } catch (error) {
      // Mejorar el mensaje de error para más contexto
      logger.error(`Error al descargar archivo de Drive: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica si un ID de Google Drive es válido
   * @param {string} fileId - ID del archivo a verificar
   * @returns {boolean} - true si el ID parece válido
   */
  validateDriveId(fileId) {
    if (!fileId || typeof fileId !== 'string') {
      return false;
    }
    
    // Los IDs de Drive generalmente tienen entre 25 y 44 caracteres
    // y contienen letras, números, guiones y guiones bajos
    const validIdPattern = /^[a-zA-Z0-9_-]{25,44}$/;
    return validIdPattern.test(fileId);
  }
  
  /**
   * Verifica si un archivo existe en Google Drive
   * @param {string} fileId - ID del archivo a verificar
   * @returns {Promise<boolean>} - true si el archivo existe
   */
  async checkFileExists(fileId) {
    try {
      // Intentar obtener solo los metadatos para verificar si existe
      await this.drive.files.get({
        fileId,
        fields: 'id,name,mimeType' // Solo obtener campos básicos
      });
      return true;
    } catch (error) {
      if (error.code === 404) {
        logger.warn(`Archivo con ID ${fileId} no existe en Google Drive`);
        return false;
      }
      
      // Otros errores posibles (permisos, etc.)
      logger.error(`Error al verificar archivo ${fileId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sanitiza un nombre de archivo para hacerlo seguro en el sistema de archivos
   * @param {string} fileName - Nombre de archivo a sanitizar
   * @returns {string} Nombre de archivo sanitizado
   */
  sanitizeFileName(fileName) {
    return fileName
      .replace(/[/\\?%*:|"<>]/g, '-') // Reemplazar caracteres ilegales
      .replace(/ /g, '_')             // Reemplazar espacios con guiones bajos
      .substring(0, 100);             // Limitar longitud
  }

  /**
   * Limpia archivos temporales antiguos
   */
  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempFolder);
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.tempFolder, file);
        const stats = await fs.stat(filePath);
        
        // Eliminar archivos con más de 1 hora
        if (now - stats.mtimeMs > 60 * 60 * 1000) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Limpieza completada: ${deletedCount} archivos temporales eliminados`);
      }
    } catch (error) {
      logger.error(`Error en limpieza de archivos temporales: ${error.message}`);
    }
  }
}

// Exportar las funciones y cliente
module.exports = {
  downloadFile: async (fileId, fileName) => {
    const googleDriveService = new GoogleDriveService();
    return googleDriveService.downloadFile(fileId, fileName);
  },
  listFiles: async (folderId = 'root', pageToken = null, allFiles = []) => {
    const googleDriveService = new GoogleDriveService();
    return googleDriveService.listFiles(folderId, pageToken, allFiles);
  },
  deleteFile: async (fileId) => {
    const googleDriveService = new GoogleDriveService();
    // Implementar lógica para eliminar archivos
  },
  getAuthClient: async () => {
    const googleDriveService = new GoogleDriveService();
    if (!googleDriveService.auth) {
      await googleDriveService.initializeDrive();
    }
    return googleDriveService.auth;
  },
  getDriveClient: () => {
    const googleDriveService = new GoogleDriveService();
    return googleDriveService.drive;
  }
};
