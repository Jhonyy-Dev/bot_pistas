/**
 * Script para añadir IDs de Google Drive a las canciones existentes
 * Este script utiliza la API de Google Drive para buscar archivos MP3 y
 * actualizar la base de datos con sus IDs
 */
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { Sequelize, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Configuración de la base de datos
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite', 
  logging: false
});

// Ruta al archivo de credenciales de Google Drive
const CREDENTIALS_PATH = path.join(__dirname, './config/google-credentials.json');

// Definir el modelo de Canción
const Cancion = sequelize.define('Cancion', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: Sequelize.STRING,
  artista: Sequelize.STRING,
  album: Sequelize.STRING,
  genero: Sequelize.STRING,
  duracion: Sequelize.INTEGER,
  ruta_archivo: Sequelize.STRING,
  tamanio_bytes: Sequelize.INTEGER,
  fecha_subida: Sequelize.DATE,
  url_externa: Sequelize.STRING,
  usar_url_externa: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Canciones',
  timestamps: false
});

// Interfaz para entrada del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Inicializa la conexión con Google Drive
 * @returns {Object} Cliente de Google Drive
 */
async function initGoogleDrive() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.log('❌ No se encontró el archivo de credenciales de Google Drive');
      console.log(`Por favor, coloca tus credenciales en: ${CREDENTIALS_PATH}`);
      return null;
    }

    const credentials = require(CREDENTIALS_PATH);
    
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });

    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error(`❌ Error al inicializar Google Drive: ${error.message}`);
    return null;
  }
}

/**
 * Busca archivos MP3 en Google Drive
 * @param {Object} drive Cliente de Google Drive
 * @returns {Array} Lista de archivos MP3
 */
async function buscarArchivosMp3(drive) {
  try {
    console.log('Buscando archivos MP3 en Google Drive...');
    
    const response = await drive.files.list({
      q: "mimeType contains 'audio/' and trashed=false",
      fields: 'nextPageToken, files(id, name, mimeType)',
      spaces: 'drive',
      pageSize: 1000
    });
    
    const files = response.data.files;
    console.log(`✅ Se encontraron ${files.length} archivos de audio en Google Drive`);
    
    return files;
  } catch (error) {
    console.error(`❌ Error al buscar archivos en Google Drive: ${error.message}`);
    return [];
  }
}

/**
 * Busca canciones sin ID de Google Drive en la base de datos
 * @returns {Array} Lista de canciones sin ID
 */
async function buscarCancionesSinID() {
  try {
    const canciones = await Cancion.findAll({
      where: {
        [Op.or]: [
          { url_externa: null },
          { url_externa: '' },
          { url_externa: 'No tiene URL externa' }
        ]
      }
    });
    
    console.log(`✅ Se encontraron ${canciones.length} canciones sin ID de Google Drive`);
    return canciones;
  } catch (error) {
    console.error(`❌ Error al buscar canciones sin ID: ${error.message}`);
    return [];
  }
}

/**
 * Actualiza una canción con su ID de Google Drive
 * @param {Object} cancion Canción a actualizar
 * @param {string} driveId ID de Google Drive
 */
async function actualizarCancion(cancion, driveId) {
  try {
    await cancion.update({
      url_externa: driveId,
      usar_url_externa: true
    });
    
    console.log(`✅ Canción "${cancion.nombre}" actualizada con ID: ${driveId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error al actualizar canción ${cancion.id}: ${error.message}`);
    return false;
  }
}

/**
 * Compara nombres para encontrar coincidencias
 * @param {string} nombreCancion Nombre de la canción en la DB
 * @param {string} nombreArchivo Nombre del archivo en Drive
 * @returns {number} Puntuación de similitud (0-100)
 */
function compararNombres(nombreCancion, nombreArchivo) {
  // Normalizar ambos nombres
  const normCancion = nombreCancion.toLowerCase()
    .replace(/\.(mp3|wav|ogg|m4a|flac)$/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const normArchivo = nombreArchivo.toLowerCase()
    .replace(/\.(mp3|wav|ogg|m4a|flac)$/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Coincidencia exacta
  if (normCancion === normArchivo) {
    return 100;
  }
  
  // Uno contiene al otro completamente
  if (normCancion.includes(normArchivo) || normArchivo.includes(normCancion)) {
    return 90;
  }
  
  // Calcular similitud basada en palabras compartidas
  const palabrasCancion = normCancion.split(' ');
  const palabrasArchivo = normArchivo.split(' ');
  
  let palabrasComunes = 0;
  for (const palabra of palabrasCancion) {
    if (palabra.length > 2 && palabrasArchivo.includes(palabra)) {
      palabrasComunes++;
    }
  }
  
  const porcentajePalabras = Math.min(
    (palabrasComunes / palabrasCancion.length) * 100,
    (palabrasComunes / palabrasArchivo.length) * 100
  );
  
  return porcentajePalabras;
}

/**
 * Empareja canciones con archivos de Google Drive
 * @param {Array} canciones Lista de canciones sin ID
 * @param {Array} archivos Lista de archivos de Google Drive
 */
async function emparejarCancionesYArchivos(canciones, archivos) {
  console.log('\n=== EMPAREJANDO CANCIONES CON ARCHIVOS DE GOOGLE DRIVE ===\n');
  
  if (canciones.length === 0 || archivos.length === 0) {
    console.log('❌ No hay canciones o archivos para emparejar');
    return;
  }
  
  let actualizadas = 0;
  let noActualizadas = 0;
  
  // Para cada canción sin ID, buscar el archivo que mejor coincida
  for (const cancion of canciones) {
    // Calcular puntuación de similitud para cada archivo
    const coincidencias = archivos.map(archivo => ({
      archivo,
      puntuacion: compararNombres(cancion.nombre, archivo.name)
    }));
    
    // Ordenar por puntuación de mayor a menor
    coincidencias.sort((a, b) => b.puntuacion - a.puntuacion);
    
    // Si hay una coincidencia con puntuación alta (>75), hacer actualización automática
    if (coincidencias[0].puntuacion > 75) {
      const archivo = coincidencias[0].archivo;
      await actualizarCancion(cancion, archivo.id);
      actualizadas++;
    } 
    // Si la mejor coincidencia tiene puntuación moderada, preguntar al usuario
    else if (coincidencias[0].puntuacion > 50) {
      console.log(`\nCanción: "${cancion.nombre}" (${cancion.artista || 'Desconocido'})`);
      console.log(`Posible coincidencia: "${coincidencias[0].archivo.name}" (${coincidencias[0].puntuacion.toFixed(0)}% similitud)`);
      
      const respuesta = await preguntarUsuario('¿Deseas actualizar esta canción con este ID? (S/N): ');
      
      if (respuesta.toLowerCase() === 's') {
        await actualizarCancion(cancion, coincidencias[0].archivo.id);
        actualizadas++;
      } else {
        // Si rechaza la primera opción, mostrar otras 2 opciones
        if (coincidencias.length > 1) {
          console.log('\nOtras posibles coincidencias:');
          for (let i = 1; i < Math.min(coincidencias.length, 3); i++) {
            console.log(`${i+1}. "${coincidencias[i].archivo.name}" (${coincidencias[i].puntuacion.toFixed(0)}% similitud)`);
          }
          
          const opcion = await preguntarUsuario('Elige una opción (número) o 0 para ninguna: ');
          const num = parseInt(opcion);
          
          if (num > 0 && num <= 3 && coincidencias[num-1]) {
            await actualizarCancion(cancion, coincidencias[num-1].archivo.id);
            actualizadas++;
          } else {
            noActualizadas++;
          }
        } else {
          noActualizadas++;
        }
      }
    } else {
      console.log(`No se encontró coincidencia para: "${cancion.nombre}"`);
      noActualizadas++;
    }
  }
  
  console.log(`\n=== RESUMEN DE EMPAREJAMIENTO ===`);
  console.log(`✅ Canciones actualizadas: ${actualizadas}`);
  console.log(`❌ Canciones no actualizadas: ${noActualizadas}`);
  console.log(`Total procesadas: ${canciones.length}`);
}

/**
 * Función auxiliar para preguntar al usuario
 */
function preguntarUsuario(pregunta) {
  return new Promise((resolve) => {
    rl.question(pregunta, (respuesta) => {
      resolve(respuesta);
    });
  });
}

/**
 * Función principal
 */
async function main() {
  console.log("=================================================");
  console.log("  ACTUALIZACIÓN DE IDs DE GOOGLE DRIVE");
  console.log("=================================================");
  
  // Verificar conexión con la base de datos
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión establecida con la base de datos');
  } catch (error) {
    console.error(`❌ Error de conexión a la base de datos: ${error.message}`);
    rl.close();
    return;
  }
  
  // Inicializar Google Drive
  const drive = await initGoogleDrive();
  if (!drive) {
    console.log('❌ No se pudo inicializar Google Drive');
    rl.close();
    return;
  }
  
  // Buscar archivos MP3 en Google Drive
  const archivos = await buscarArchivosMp3(drive);
  if (archivos.length === 0) {
    console.log('❌ No se encontraron archivos MP3 en Google Drive');
    rl.close();
    return;
  }
  
  // Buscar canciones sin ID
  const canciones = await buscarCancionesSinID();
  if (canciones.length === 0) {
    console.log('✅ ¡Todas las canciones ya tienen ID de Google Drive!');
    rl.close();
    return;
  }
  
  // Emparejar canciones y archivos
  await emparejarCancionesYArchivos(canciones, archivos);
  
  console.log('\n¡Proceso completado!');
  rl.close();
}

// Ejecutar el script
main().catch(error => {
  console.error(`Error en la ejecución: ${error.message}`);
  rl.close();
});
