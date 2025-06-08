/**
 * Script para indexar archivos MP3 de Google Drive a la base de datos
 * Este script explora automáticamente una carpeta de Google Drive y agrega todas las canciones a la base de datos
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const path = require('path');
const googleDriveService = require('./src/services/googleDriveService');

// ID de la carpeta raíz en Google Drive donde están los MP3s
const ROOT_FOLDER_ID = '1GpXY404tR-8e0B9WC40i3szlfUgy1p-s';

// Leer credenciales de .env
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'bot_chiveros_peru';

/**
 * Indexa todos los archivos MP3 de Google Drive a la base de datos
 */
async function indexarGoogleDrive() {
  console.log('🔎 Iniciando indexación de archivos MP3 en Google Drive...');
  let connection;
  
  try {
    // Crear conexión a la base de datos
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    
    console.log('✅ Conexión a la base de datos establecida');
    
    // Verificar si la columna url_externa existe, si no, crearla
    await verificarEstructuraTabla(connection);
    
    // Buscar archivos MP3 en Google Drive
    console.log(`🔍 Buscando archivos MP3 en carpeta ${ROOT_FOLDER_ID}...`);
    const allFiles = await googleDriveService.listFiles(ROOT_FOLDER_ID);
    
    // Filtrar solo archivos MP3
    const mp3Files = allFiles.filter(file => 
      file.name.toLowerCase().endsWith('.mp3')
    );
    
    console.log(`✅ Se encontraron ${mp3Files.length} archivos MP3 en Google Drive`);
    
    if (mp3Files.length === 0) {
      console.log('⚠️ No se encontraron archivos MP3 en la carpeta especificada');
      console.log('Verifica que:');
      console.log('1. El ID de carpeta es correcto');
      console.log('2. Has compartido la carpeta con el email de la cuenta de servicio');
      console.log('3. La carpeta contiene archivos MP3');
      return;
    }
    
    // Procesar cada archivo MP3
    console.log('🔄 Actualizando base de datos...');
    
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const [index, file] of mp3Files.entries()) {
      // Mostrar progreso
      if ((index + 1) % 100 === 0 || index === 0 || index === mp3Files.length - 1) {
        console.log(`Procesando ${index + 1} de ${mp3Files.length}...`);
      }
      
      // Obtener metadata del nombre del archivo
      const fileName = file.name.replace(/\.mp3$/i, '');
      
      // Intentar extraer artista y nombre de canción
      let artista = 'Desconocido';
      let cancion = fileName;
      
      // Patrones comunes: "Artista - Canción" o similares
      const patterns = [' - ', '_-_', ' – ', '–', '-'];
      for (const pattern of patterns) {
        if (fileName.includes(pattern)) {
          const parts = fileName.split(pattern, 2);
          if (parts.length === 2) {
            artista = parts[0].trim();
            cancion = parts[1].trim();
            break;
          }
        }
      }
      
      // Buscar si la canción ya existe
      const [existingRows] = await connection.query(
        'SELECT id FROM canciones WHERE (nombre LIKE ? AND artista LIKE ?) OR ruta_archivo LIKE ?', 
        [`%${cancion}%`, `%${artista}%`, `%${file.name}%`]
      );
      
      if (existingRows.length > 0) {
        // Actualizar canción existente
        await connection.query(
          'UPDATE canciones SET url_externa = ?, usar_url_externa = TRUE WHERE id = ?',
          [file.id, existingRows[0].id]
        );
        updatedCount++;
      } else {
        // Verificar si ya existe alguna canción con url_externa igual a este file.id
        const [existingDriveRows] = await connection.query(
          'SELECT id FROM canciones WHERE url_externa = ?', 
          [file.id]
        );
        
        if (existingDriveRows.length > 0) {
          skippedCount++;
          continue;
        }
        
        // Insertar nueva canción
        await connection.query(
          'INSERT INTO canciones (nombre, artista, album, genero, ruta_archivo, url_externa, usar_url_externa) VALUES (?, ?, ?, ?, ?, ?, TRUE)',
          [cancion, artista, 'Google Drive', 'Variado', file.name, file.id]
        );
        addedCount++;
      }
    }
    
    console.log('\n📊 Resultado de la indexación:');
    console.log(`• Total de archivos MP3 encontrados: ${mp3Files.length}`);
    console.log(`• Nuevas canciones añadidas: ${addedCount}`);
    console.log(`• Canciones actualizadas: ${updatedCount}`);
    console.log(`• Canciones omitidas (duplicadas): ${skippedCount}`);
    
    // Activar el uso de Google Drive
    console.log('\n🔧 Activando Google Drive como fuente principal...');
    await connection.query('UPDATE canciones SET usar_url_externa = TRUE WHERE url_externa IS NOT NULL AND url_externa != ""');
    
    // Estadísticas finales
    const [countTotal] = await connection.query('SELECT COUNT(*) as total FROM canciones');
    const [countDrive] = await connection.query('SELECT COUNT(*) as total FROM canciones WHERE usar_url_externa = TRUE');
    
    console.log(`\n📊 Base de datos actualizada:`);
    console.log(`• Total de canciones: ${countTotal[0].total}`);
    console.log(`• Canciones configuradas para usar Google Drive: ${countDrive[0].total} (${Math.round((countDrive[0].total/countTotal[0].total)*100)}%)`);
    
    console.log('\n✅ Proceso completado exitosamente');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.sqlMessage) {
      console.error('Error SQL:', error.sqlMessage);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Verifica que la estructura de la tabla tenga las columnas necesarias
 * Si no existen, las crea
 */
async function verificarEstructuraTabla(connection) {
  try {
    // Verificar si la columna url_externa existe
    const [columns] = await connection.query('SHOW COLUMNS FROM canciones LIKE "url_externa"');
    
    if (columns.length === 0) {
      console.log('🔧 Añadiendo columnas necesarias a la tabla canciones...');
      
      // Añadir columna url_externa
      await connection.query('ALTER TABLE canciones ADD COLUMN url_externa VARCHAR(255)');
      console.log('✅ Columna url_externa añadida');
      
      // Verificar si la columna usar_url_externa existe
      const [columnsUsar] = await connection.query('SHOW COLUMNS FROM canciones LIKE "usar_url_externa"');
      
      if (columnsUsar.length === 0) {
        // Añadir columna usar_url_externa
        await connection.query('ALTER TABLE canciones ADD COLUMN usar_url_externa BOOLEAN DEFAULT FALSE');
        console.log('✅ Columna usar_url_externa añadida');
      }
    }
    
    console.log('✅ Estructura de la base de datos verificada');
  } catch (error) {
    console.error('❌ Error al verificar estructura de la tabla:', error.message);
    throw error;
  }
}

// Ejecutar función principal
indexarGoogleDrive()
  .then(() => {
    console.log('\n🚀 Listo para iniciar el bot. Ejecuta: npm start');
  })
  .catch(error => {
    console.error('\n❌ Error general:', error);
    process.exit(1);
  });
