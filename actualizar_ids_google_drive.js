/**
 * Script para actualizar los IDs de Google Drive en la base de datos
 * Este script permite configurar manualmente IDs de Google Drive para canciones específicas
 */

require('dotenv').config();
const { Sequelize, Op } = require('sequelize');
const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
// Importar el servicio de Google Drive directamente
const googleDriveService = require('./src/services/googleDriveService');
const winston = require('winston');

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/google_drive_updater.log' })
  ]
});

// Configurar conexión a la base de datos
const sequelize = new Sequelize(
  process.env.DB_NAME || 'bot_chiveros_peru',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false
  }
);

// Definir el modelo de Canción
const Cancion = sequelize.define('canciones', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: {
    type: Sequelize.STRING,
    allowNull: false
  },
  artista: {
    type: Sequelize.STRING
  },
  album: {
    type: Sequelize.STRING
  },
  genero: {
    type: Sequelize.STRING
  },
  duracion: {
    type: Sequelize.STRING
  },
  ruta_archivo: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  tamanio_bytes: {
    type: Sequelize.INTEGER
  },
  url_externa: {
    type: Sequelize.STRING
  },
  usar_url_externa: {
    type: Sequelize.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'canciones',
  timestamps: false
});

// Interfaz para entrada de usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Función principal
 */
async function main() {
  try {
    // Verificar conexión a la base de datos
    await sequelize.authenticate();
    logger.info('Conexión a la base de datos establecida correctamente');

    // Mostrar menú
    showMenu();
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Mostrar menú principal
 */
function showMenu() {
  console.log('\n===== Actualización de IDs de Google Drive =====');
  console.log('1. Buscar canciones sin ID de Google Drive');
  console.log('2. Actualizar ID de Google Drive para una canción específica');
  console.log('3. Listar archivos en Google Drive');
  console.log('4. Salir');
  
  rl.question('\nSelecciona una opción: ', async (answer) => {
    switch (answer) {
      case '1':
        await buscarCancionesSinID();
        break;
      case '2':
        await actualizarIDCancion();
        break;
      case '3':
        await listarArchivosGoogleDrive();
        break;
      case '4':
        console.log('Saliendo...');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('Opción no válida. Intenta nuevamente.');
        showMenu();
    }
  });
}

/**
 * Buscar canciones sin ID de Google Drive
 */
async function buscarCancionesSinID() {
  try {
    // Búsqueda directa a la base de datos para evitar problemas con el ORM
    const query = `
      SELECT * FROM canciones 
      WHERE url_externa IS NULL 
         OR url_externa = '' 
         OR url_externa = 'No tiene URL externa'
         OR url_externa LIKE '%No tiene%'
      ORDER BY id DESC
      LIMIT 100
    `;
    
    const [canciones] = await sequelize.query(query);
    
    // Si no se encuentran canciones, intenta otra consulta alternativa
    if (canciones.length === 0) {
      console.log("\nProbando con una consulta alternativa...");
      const backupQuery = `
        SELECT * FROM canciones 
        WHERE url_externa IS NULL 
           OR url_externa = '' 
           OR url_externa NOT LIKE '%-%'
        ORDER BY id DESC
        LIMIT 100
      `;
      
      const [backupResults] = await sequelize.query(backupQuery);
      if (backupResults.length > 0) {
        return backupResults;
      }
    }
    
    console.log(`\nSe encontraron ${canciones.length} canciones sin ID de Google Drive:`);
    
    canciones.forEach((cancion, index) => {
      console.log(`${index + 1}. ID: ${cancion.id}, Título: ${cancion.nombre}, Artista: ${cancion.artista || 'Desconocido'}`);
    });
    
    console.log('\nPara actualizar una canción, usa la opción 2 del menú.');
    
    rl.question('\nPresiona Enter para volver al menú...', () => {
      showMenu();
    });
  } catch (error) {
    logger.error(`Error al buscar canciones: ${error.message}`);
    rl.question('\nPresiona Enter para volver al menú...', () => {
      showMenu();
    });
  }
}

/**
 * Actualizar ID de Google Drive para una canción específica
 */
async function actualizarIDCancion() {
  rl.question('\nIngresa el ID de la canción en la base de datos: ', async (input) => {
    try {
      // Validar que el input sea un número
      const cancionId = parseInt(input);
      
      if (isNaN(cancionId)) {
        console.log('Error: Debes ingresar un número válido como ID');
        rl.question('\nPresiona Enter para volver al menú...', () => {
          showMenu();
        });
        return;
      }
      
      const cancion = await Cancion.findByPk(cancionId);
      
      if (!cancion) {
        console.log(`No se encontró ninguna canción con ID ${cancionId}`);
        rl.question('\nPresiona Enter para volver al menú...', () => {
          showMenu();
        });
        return;
      }
      
      console.log('\nCanción encontrada:');
      console.log(`ID: ${cancion.id}`);
      console.log(`Título: ${cancion.nombre}`);
      console.log(`Artista: ${cancion.artista || 'Desconocido'}`);
      console.log(`Ruta del archivo: ${cancion.ruta_archivo}`);
      console.log(`ID actual de Google Drive: ${cancion.url_externa || 'No tiene'}`);
      
      rl.question('\nIngresa el nuevo ID de Google Drive para esta canción: ', async (googleDriveId) => {
        // Actualizar la canción
        await cancion.update({
          url_externa: googleDriveId,
          usar_url_externa: true
        });
        
        console.log(`\n¡Canción actualizada exitosamente! Ahora usará Google Drive con ID: ${googleDriveId}`);
        
        rl.question('\nPresiona Enter para volver al menú...', () => {
          showMenu();
        });
      });
    } catch (error) {
      logger.error(`Error al actualizar la canción: ${error.message}`);
      rl.question('\nPresiona Enter para volver al menú...', () => {
        showMenu();
      });
    }
  });
}

/**
 * Listar archivos en Google Drive
 */
async function listarArchivosGoogleDrive() {
  try {
    console.log('\nObteniendo lista de archivos en Google Drive...');
    
    // Crear una instancia de GoogleDriveService directamente para acceder a sus métodos
    const { google } = require('googleapis');
    const fs = require('fs');
    const path = require('path');
    
    // Cargar credenciales para un cliente drive directo
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Archivo de credenciales no encontrado: ${credentialsPath}`);
    }
    
    // Crear autenticación directamente con las credenciales
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    // Crear cliente de Drive
    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    
    // Array para almacenar todos los archivos
    let allFiles = [];
    // Token para la paginación
    let nextPageToken = null;
    let pageCount = 1;
    
    do {
      console.log(`\nObteniendo página ${pageCount} de archivos...`);
      
      // Buscar archivos MP3 con paginación
      const response = await drive.files.list({
        q: "mimeType contains 'audio/' or name contains '.mp3'",
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 100,
        pageToken: nextPageToken
      });
      
      const files = response.data.files || [];
      allFiles = [...allFiles, ...files];
      
      // Actualizar el token para la siguiente página
      nextPageToken = response.data.nextPageToken;
      pageCount++;
      
      console.log(`Encontrados ${files.length} archivos en esta página.`);
      
      // Limitar a 5 páginas para evitar exceder cuotas de API
      if (pageCount > 5) break;
      
    } while (nextPageToken);
    
    const files = allFiles;
    
    console.log(`\nSe encontraron ${files.length} archivos en Google Drive`);
    
    // Variables para paginación local
    let currentPage = 1;
    const pageSize = 20;
    const totalPages = Math.ceil(files.length / pageSize);
    
    // Función para mostrar una página específica
    function showPage(page) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, files.length);
      const mp3Files = files.slice(startIndex, endIndex);
      
      console.log(`\nPágina ${page} de ${totalPages} (mostrando archivos ${startIndex + 1}-${endIndex} de ${files.length}):`);
      
      mp3Files.forEach((file, index) => {
        console.log(`${startIndex + index + 1}. ID: ${file.id}, Nombre: ${file.name}`);
      });
    }
    
    // Mostrar primera página
    showPage(currentPage);
    
    console.log('\nOpciones de navegación:');
    console.log('1. Ver página siguiente');
    console.log('2. Ver página anterior');
    console.log('3. Ir a página específica');
    console.log('4. Buscar por nombre');
    console.log('5. Volver al menú principal');
    
    // Función para manejar la navegación
    function handleNavigation() {
      rl.question('\nSelecciona una opción: ', async (choice) => {
        switch (choice) {
          case '1': // Página siguiente
            if (currentPage < totalPages) {
              currentPage++;
              showPage(currentPage);
              console.log('\nUsa estos IDs para actualizar las canciones en la base de datos.');
              handleNavigation();
            } else {
              console.log('\nYa estás en la última página.');
              handleNavigation();
            }
            break;
          
          case '2': // Página anterior
            if (currentPage > 1) {
              currentPage--;
              showPage(currentPage);
              console.log('\nUsa estos IDs para actualizar las canciones en la base de datos.');
              handleNavigation();
            } else {
              console.log('\nYa estás en la primera página.');
              handleNavigation();
            }
            break;
          
          case '3': // Ir a página específica
            rl.question(`\nIngresa el número de página (1-${totalPages}): `, (pageNum) => {
              const page = parseInt(pageNum);
              if (!isNaN(page) && page >= 1 && page <= totalPages) {
                currentPage = page;
                showPage(currentPage);
                console.log('\nUsa estos IDs para actualizar las canciones en la base de datos.');
              } else {
                console.log(`\nNúmero de página inválido. Debe estar entre 1 y ${totalPages}.`);
              }
              handleNavigation();
            });
            break;
          
          case '4': // Buscar por nombre
            rl.question('\nIngresa el término de búsqueda: ', (term) => {
              const searchTerm = term.toLowerCase();
              const filtered = files.filter(file => 
                file.name.toLowerCase().includes(searchTerm));
              
              if (filtered.length > 0) {
                console.log(`\nSe encontraron ${filtered.length} coincidencias:`);
                filtered.slice(0, 20).forEach((file, index) => {
                  console.log(`${index + 1}. ID: ${file.id}, Nombre: ${file.name}`);
                });
                
                if (filtered.length > 20) {
                  console.log(`\n... y ${filtered.length - 20} más. Refina tu búsqueda para ver resultados más precisos.`);
                }
              } else {
                console.log('\nNo se encontraron coincidencias.');
              }
              
              handleNavigation();
            });
            break;
          
          case '5': // Volver al menú principal
            showMenu();
            break;
          
          default:
            console.log('\nOpción no válida. Inténtalo de nuevo.');
            handleNavigation();
        }
      });
    }
    
    // Iniciar la navegación
    handleNavigation();
  } catch (error) {
    logger.error(`Error al listar archivos de Google Drive: ${error.message}`);
    rl.question('\nPresiona Enter para volver al menú...', () => {
      showMenu();
    });
  }
}

// Ejecutar función principal
main().catch(err => {
  logger.error(`Error inesperado: ${err.message}`);
  process.exit(1);
});
