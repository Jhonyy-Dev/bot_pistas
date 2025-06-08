/**
 * Script para verificar la integración de Google Drive y asegurar que 
 * no queden referencias a MediaFire en el sistema
 */
require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const mysql = require('mysql2/promise');

// Leer credenciales de .env
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'bot_chiveros_peru';

async function verificarIntegracion() {
  console.log('🔍 Verificando la integración de Google Drive...');
  let connection;
  
  try {
    // Verificar archivos del sistema
    console.log('\n📁 Verificando estructura de archivos:');
    
    // Verificar archivo de credenciales
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    if (await fs.exists(credentialsPath)) {
      console.log('✅ Archivo de credenciales de Google Drive encontrado');
    } else {
      console.log('❌ Archivo de credenciales no encontrado. Debes colocar google-credentials.json en la raíz del proyecto');
    }
    
    // Verificar servicio de Google Drive
    const driveServicePath = path.join(process.cwd(), 'src', 'services', 'googleDriveService.js');
    if (await fs.exists(driveServicePath)) {
      console.log('✅ Servicio de Google Drive encontrado');
    } else {
      console.log('❌ Servicio de Google Drive no encontrado. Ejecuta la configuración completa');
    }
    
    // Verificar si hay archivos de MediaFire
    const mediaFireCount = await checkFilesByPattern('mediafire', path.join(process.cwd()));
    if (mediaFireCount === 0) {
      console.log('✅ No se encontraron archivos relacionados con MediaFire');
    } else {
      console.log(`⚠️ Se encontraron ${mediaFireCount} archivos que contienen referencias a MediaFire`);
    }
    
    // Verificar la base de datos
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    
    console.log('\n🛢️ Verificando la base de datos:');
    
    // Verificar estructura de la tabla canciones
    const [columns] = await connection.query('SHOW COLUMNS FROM canciones');
    const columnNames = columns.map(c => c.Field);
    
    if (columnNames.includes('url_externa') && columnNames.includes('usar_url_externa')) {
      console.log('✅ Estructura de tabla canciones correcta');
    } else {
      console.log('❌ Faltan columnas en la tabla canciones. Ejecuta indexar_google_drive.js');
    }
    
    // Contar canciones con Google Drive
    const [countDrive] = await connection.query(
      `SELECT COUNT(*) as total FROM canciones 
       WHERE usar_url_externa = TRUE 
       AND url_externa IS NOT NULL 
       AND url_externa NOT LIKE "http%"`
    );
    
    // Contar canciones con MediaFire
    const [countMediaFire] = await connection.query(
      `SELECT COUNT(*) as total FROM canciones 
       WHERE url_externa LIKE "%mediafire%"`
    );
    
    // Contar total de canciones
    const [countTotal] = await connection.query('SELECT COUNT(*) as total FROM canciones');
    
    console.log(`📊 Total de canciones en la base de datos: ${countTotal[0].total}`);
    console.log(`📊 Canciones configuradas con Google Drive: ${countDrive[0].total} (${Math.round((countDrive[0].total/countTotal[0].total)*100)}%)`);
    
    if (countMediaFire[0].total > 0) {
      console.log(`⚠️ Aún hay ${countMediaFire[0].total} canciones con referencias a MediaFire`);
      console.log('Para eliminarlas, ejecuta: node limpiar_mediafire_db.js');
    } else {
      console.log('✅ No se encontraron canciones con referencias a MediaFire');
    }
    
    // Comprobación final
    console.log('\n🏁 Resultado de la verificación:');
    
    if (countDrive[0].total === 0) {
      console.log('⚠️ No hay canciones configuradas con Google Drive');
      console.log('Ejecuta: node indexar_google_drive.js');
    } else if (countDrive[0].total > 0 && !await fs.exists(credentialsPath)) {
      console.log('❌ Falta archivo de credenciales, pero hay canciones configuradas');
      console.log('El bot no funcionará correctamente hasta que agregues google-credentials.json');
    } else if (countMediaFire[0].total > 0) {
      console.log('⚠️ Se requiere limpieza de referencias a MediaFire');
      console.log('Ejecuta: node limpiar_mediafire_db.js');
    } else if (mediaFireCount > 0) {
      console.log('⚠️ Hay archivos relacionados con MediaFire que pueden eliminarse');
    } else if (countDrive[0].total > 0 && await fs.exists(credentialsPath)) {
      console.log('✅ Todo está configurado correctamente para usar Google Drive');
      console.log(`🎵 ${countDrive[0].total} canciones listas para ser servidas a través de Google Drive`);
      console.log('\n🚀 El bot está listo para funcionar. Ejecuta: npm start');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.sqlMessage) {
      console.error('Mensaje SQL:', error.sqlMessage);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function checkFilesByPattern(pattern, directory) {
  let count = 0;
  
  const items = await fs.readdir(directory);
  
  for (const item of items) {
    const itemPath = path.join(directory, item);
    const stats = await fs.stat(itemPath);
    
    // Ignorar carpetas ocultas y node_modules
    if (item.startsWith('.') || item === 'node_modules') continue;
    
    // Buscar en directorios recursivamente
    if (stats.isDirectory()) {
      count += await checkFilesByPattern(pattern, itemPath);
    } 
    // Verificar archivos por nombre o contenido
    else if (stats.isFile()) {
      // Verificar por nombre
      if (item.toLowerCase().includes(pattern.toLowerCase())) {
        count++;
        continue;
      }
      
      // Para archivos de código, verificar también el contenido
      if (['.js', '.sql', '.json'].includes(path.extname(item))) {
        try {
          const content = await fs.readFile(itemPath, 'utf8');
          if (content.toLowerCase().includes(pattern.toLowerCase())) {
            count++;
          }
        } catch (err) {
          // Ignorar errores de lectura
        }
      }
    }
  }
  
  return count;
}

// Ejecutar verificación
verificarIntegracion()
  .catch(error => {
    console.error('\n❌ Error general:', error);
  });
