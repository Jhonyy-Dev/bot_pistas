require('dotenv').config();
const { google } = require('googleapis');
const { Usuario, Cancion, sequelize } = require('./src/database/models');
const { Op } = require('sequelize');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const logger = require('./src/config/logger');

// Importar completamente el servicio de Google Drive
const googleDriveService = require('./src/services/googleDriveService');

// Función para calcular la similitud entre dos cadenas (algoritmo de Levenshtein)
function calcularSimilitud(str1, str2) {
  // Normalizar strings: convertir a minúsculas y eliminar caracteres especiales
  const normalizar = (s) => {
    return s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
      .replace(/[^\w\s]/g, '') // Eliminar caracteres especiales
      .replace(/\s+/g, ' ') // Reemplazar múltiples espacios con uno solo
      .trim();
  };
  
  str1 = normalizar(str1);
  str2 = normalizar(str2);
  
  // Algoritmo de distancia de Levenshtein
  const m = str1.length;
  const n = str2.length;
  
  // Crear matriz
  const d = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
  
  // Inicializar primera fila y columna
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  
  // Calcular distancia
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // eliminación
        d[i][j - 1] + 1,      // inserción
        d[i - 1][j - 1] + cost // sustitución
      );
    }
  }
  
  // Calcular similitud (0-100%)
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 100; // Ambas cadenas están vacías
  
  const similitud = 100 * (1 - d[m][n] / maxLen);
  return similitud;
}

// Clase simplificada para acceder a Google Drive directamente
class DriveAccess {
  constructor() {
    this.fs = require('fs-extra');
    this.path = require('path');
    this.google = require('googleapis').google;
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
}

// Función para obtener todos los archivos MP3 de Google Drive (con paginación)
async function obtenerArchivosDrive() {
  let allFiles = [];
  let nextPageToken = null;
  
  try {
    // Inicializar acceso a Drive
    const driveAccess = new DriveAccess();
    const drive = await driveAccess.initialize();
    
    console.log('Cliente de Google Drive inicializado correctamente. Buscando archivos...');
    
    // Buscar en múltiples páginas para superar el límite de 100
    let paginasRevisadas = 0;
    const maxPaginas = 10; // Ajusta según sea necesario para obtener todos los archivos
    
    do {
      const response = await drive.files.list({
        q: "mimeType contains 'audio/' or name contains '.mp3'",
        fields: 'nextPageToken, files(id, name)',
        spaces: 'drive',
        pageToken: nextPageToken,
        pageSize: 100 // Máximo permitido por la API
      });
      
      const files = response.data.files;
      if (files && files.length > 0) {
        allFiles = [...allFiles, ...files];
        console.log(`Obtenidos ${files.length} archivos. Total acumulado: ${allFiles.length}`);
      }
      
      nextPageToken = response.data.nextPageToken;
      paginasRevisadas++;
      
    } while (nextPageToken && paginasRevisadas < maxPaginas);
    
    return allFiles;
    
  } catch (error) {
    logger.error(`Error al obtener archivos de Google Drive: ${error.message}`);
    console.error('Error completo:', error);
    throw error;
  }
}

// Función para obtener canciones sin ID de Google Drive
async function obtenerCancionesSinID() {
  try {
    console.log('Buscando canciones sin ID válido de Google Drive...');
    
    // Primero, intentemos hacer una consulta para obtener todos los campos de una canción y ver cómo están almacenados
    const ejemploCanciones = await Cancion.findAll({
      limit: 5
    });
    
    if (ejemploCanciones.length > 0) {
      console.log('Ejemplo de estructura de canción:');
      // Mostrar todas las propiedades de una canción para entender la estructura
      const propiedades = Object.keys(ejemploCanciones[0].dataValues);
      console.log('Campos disponibles:', propiedades);
      console.log('Ejemplo url_externa:', ejemploCanciones[0].url_externa);
    }
    
    // Ahora intentemos una consulta más amplia
    console.log('Realizando consulta de canciones sin ID válido...');
    let canciones = await Cancion.findAll({
      where: {
        [Op.or]: [
          { url_externa: null },
          { url_externa: '' },
          { url_externa: 'No tiene URL externa' },
          { url_externa: {[Op.eq]: null} },
          // Añadir cualquier otro valor que pueda indicar la ausencia de un ID
          { url_externa: {[Op.like]: '%No%'} }, // Para capturar variaciones como "No disponible", etc.
          { url_externa: {[Op.like]: '%no%'} },
          { url_externa: {[Op.like]: '%sin%'} },
          // También verificar la columna usar_url_externa
          { usar_url_externa: false },
          { usar_url_externa: 0 }
        ]
      }
    });
    
    console.log(`Se encontraron ${canciones.length} canciones sin ID válido`);
    
    // Mostrar algunos ejemplos para verificación
    if (canciones.length > 0) {
      console.log('Ejemplos de canciones sin ID válido:');
      canciones.slice(0, 5).forEach(cancion => {
        console.log(`ID: ${cancion.id}, Nombre: ${cancion.nombre}, Artista: ${cancion.artista}, url_externa: ${cancion.url_externa}`);
      });
    }
    
    // Hacer una consulta específica para la canción "josimar y su yambu" que sabíamos que no tenía ID
    const josimarCancion = await Cancion.findOne({
      where: {
        [Op.or]: [
          { nombre: {[Op.like]: '%josimar y su yambu%'} },
          { nombre: {[Op.like]: '%josimar%'}, artista: {[Op.like]: '%yambu%'} }
        ]
      }
    });
    
    if (josimarCancion) {
      console.log('\nEncontrada la canción de Josimar:');
      console.log(`ID: ${josimarCancion.id}, Nombre: ${josimarCancion.nombre}, url_externa: ${josimarCancion.url_externa}`);
      
      // Si no está en la lista de canciones sin ID, agregarla
      if (!canciones.some(c => c.id === josimarCancion.id)) {
        console.log('Añadiendo esta canción a la lista de canciones sin ID');
        canciones.push(josimarCancion);
      }
    } else {
      console.log('No se encontró la canción de Josimar en la base de datos.');
    }
    
    return canciones;
  } catch (error) {
    logger.error(`Error al obtener canciones sin ID: ${error.message}`);
    console.error('Error completo:', error);
    throw error;
  }
}

// Función principal de emparejamiento
async function emparejarCanciones() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    console.log('\nIniciando proceso de emparejamiento automático...');
    console.log('\nObteniendo archivos de Google Drive...');
    const archivosGDrive = await obtenerArchivosDrive();
    console.log(`Se encontraron ${archivosGDrive.length} archivos en Google Drive.`);
    
    console.log('\nObteniendo canciones sin ID de Google Drive...');
    const cancionesSinID = await obtenerCancionesSinID();
    console.log(`Se encontraron ${cancionesSinID.length} canciones sin ID de Google Drive.`);
    
    const coincidencias = [];
    const sinCoincidencia = [];
    const umbralSimilitud = 85; // Porcentaje mínimo de similitud para considerar una coincidencia válida
    
    console.log('\nRealizando emparejamiento automático...');
    
    // Para cada canción sin ID, buscar el archivo más similar en Google Drive
    for (const cancion of cancionesSinID) {
      const nombreArchivoOriginal = cancion.ruta_archivo ? path.parse(cancion.ruta_archivo).name : '';
      // Si no hay nombre de archivo, intentar con nombre+artista
      const nombreBusqueda = nombreArchivoOriginal || `${cancion.artista} - ${cancion.nombre}`;
      
      let mejorCoincidencia = null;
      let mejorPuntaje = 0;
      
      // Buscar la mejor coincidencia entre los archivos de Google Drive
      for (const archivo of archivosGDrive) {
        const nombreArchivo = path.parse(archivo.name).name;
        const similitud = calcularSimilitud(nombreBusqueda, nombreArchivo);
        
        if (similitud > mejorPuntaje) {
          mejorPuntaje = similitud;
          mejorCoincidencia = archivo;
        }
      }
      
      // Si se encontró una coincidencia por encima del umbral, agregarla a la lista
      if (mejorCoincidencia && mejorPuntaje >= umbralSimilitud) {
        coincidencias.push({
          cancion,
          archivo: mejorCoincidencia,
          similitud: mejorPuntaje.toFixed(2)
        });
      } else {
        sinCoincidencia.push({
          cancion,
          mejorArchivo: mejorCoincidencia,
          mejorSimilitud: mejorPuntaje.toFixed(2)
        });
      }
    }
    
    console.log(`\nSe encontraron ${coincidencias.length} coincidencias automáticas (similitud ≥ ${umbralSimilitud}%).`);
    console.log(`${sinCoincidencia.length} canciones no tuvieron coincidencias confiables.`);
    
    // Mostrar las primeras coincidencias para revisión
    if (coincidencias.length > 0) {
      console.log('\nEjemplos de coincidencias encontradas:');
      const ejemplos = coincidencias.slice(0, 5); // Mostrar solo los primeros 5 ejemplos
      
      ejemplos.forEach((item, index) => {
        console.log(`\n${index + 1}. Canción DB: "${item.cancion.nombre}" (ID: ${item.cancion.id})`);
        console.log(`   Archivo GDrive: "${item.archivo.name}" (ID: ${item.archivo.id})`);
        console.log(`   Similitud: ${item.similitud}%`);
      });
    }
    
    // Preguntar si proceder con la actualización automática
    rl.question('\n¿Deseas proceder con la actualización automática? (s/n): ', async (respuesta) => {
      if (respuesta.toLowerCase() === 's') {
        console.log('\nActualizando la base de datos...');
        
        // Actualizar en lotes para mejor rendimiento
        const loteSize = 50;
        let actualizados = 0;
        
        for (let i = 0; i < coincidencias.length; i += loteSize) {
          const lote = coincidencias.slice(i, i + loteSize);
          const promesas = lote.map(item => 
            Cancion.update(
              { 
                url_externa: item.archivo.id,
                usar_url_externa: true
              },
              { where: { id: item.cancion.id } }
            )
          );
          
          await Promise.all(promesas);
          actualizados += lote.length;
          console.log(`Progreso: ${actualizados}/${coincidencias.length} actualizados...`);
        }
        
        console.log(`\n¡Actualización completada! Se actualizaron ${actualizados} canciones.`);
        
        // Ofrecer guardar un informe de las canciones que no se pudieron emparejar
        if (sinCoincidencia.length > 0) {
          rl.question('\n¿Quieres guardar un informe de las canciones sin emparejar? (s/n): ', (guardar) => {
            if (guardar.toLowerCase() === 's') {
              const contenido = sinCoincidencia.map(item => 
                `ID: ${item.cancion.id}, Nombre: "${item.cancion.nombre}", Artista: "${item.cancion.artista}", Mejor similitud: ${item.mejorSimilitud}%`
              ).join('\n');
              
              fs.writeFileSync('canciones_sin_emparejar.txt', contenido);
              console.log('\nInforme guardado en "canciones_sin_emparejar.txt"');
              rl.close();
            } else {
              rl.close();
            }
          });
        } else {
          rl.close();
        }
      } else {
        console.log('\nOperación cancelada. No se realizaron cambios en la base de datos.');
        rl.close();
      }
    });
    
  } catch (error) {
    console.error(`Error en el proceso de emparejamiento: ${error.message}`);
    rl.close();
  }
}

// Iniciar el proceso
emparejarCanciones();
