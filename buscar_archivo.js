require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs-extra');

// Término de búsqueda (pasado como argumento de línea de comandos)
const searchTerm = process.argv[2] || '';
if (!searchTerm) {
  console.log('Por favor proporciona un término de búsqueda: node buscar_archivo.js "nombre del archivo"');
  process.exit(1);
}

// Clase para acceder a Google Drive directamente
class DriveAccess {
  constructor() {
    this.fs = fs;
    this.path = path;
    this.google = google;
    this.auth = null;
    this.drive = null;
  }
  
  async initialize() {
    try {
      // Ruta al archivo de credenciales
      const credentialsPath = this.path.join(process.cwd(), 'google-credentials.json');
      
      // Verificar que el archivo existe
      if (!this.fs.existsSync(credentialsPath)) {
        throw new Error(`Archivo de credenciales no encontrado en: ${credentialsPath}`);
      }
      
      // Configurar autenticación con el archivo de credenciales
      this.auth = new this.google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ]
      });
      
      // Obtener el cliente autenticado y crear el cliente de Drive
      const authClient = await this.auth.getClient();
      this.drive = this.google.drive({ 
        version: 'v3', 
        auth: authClient 
      });
      
      return this.drive;
    } catch (error) {
      console.error(`Error al inicializar Google Drive: ${error.message}`);
      throw error;
    }
  }

  // Buscar archivos por nombre
  async searchFiles(query) {
    try {
      // Agregar filtro para buscar solo archivos MP3
      const fullQuery = `name contains '${query}' and (mimeType contains 'audio/' or name contains '.mp3')`;
      
      const response = await this.drive.files.list({
        q: fullQuery,
        fields: 'files(id, name, mimeType)',
        spaces: 'drive',
      });
      
      return response.data.files;
    } catch (error) {
      console.error(`Error al buscar archivos: ${error.message}`);
      throw error;
    }
  }
}

// Función principal
async function main() {
  try {
    console.log(`Buscando archivos que contengan: "${searchTerm}"`);
    
    // Inicializar acceso a Drive
    const driveAccess = new DriveAccess();
    await driveAccess.initialize();
    
    // Buscar archivos
    const files = await driveAccess.searchFiles(searchTerm);
    
    if (files.length === 0) {
      console.log('No se encontraron archivos que coincidan con la búsqueda.');
    } else {
      console.log(`Se encontraron ${files.length} archivos:`);
      files.forEach((file, index) => {
        console.log(`${index + 1}. ID: ${file.id}, Nombre: ${file.name}`);
      });
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Ejecutar la función principal
main();
