/**
 * Script para activar el uso de Google Drive como fuente principal de archivos MP3
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Leer credenciales de .env
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'bot_chiveros_peru';

async function activarGoogleDrive() {
  console.log('🔧 Configurando Google Drive como fuente principal de archivos MP3...');
  
  // Crear conexión
  const connection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  });
  
  try {
    // Verificar si hay canciones con IDs de Google Drive (que no empiezan con http)
    const [countNoHttp] = await connection.query(
      `SELECT COUNT(*) as total FROM canciones 
       WHERE url_externa IS NOT NULL 
       AND url_externa != "" 
       AND url_externa NOT LIKE "http%"`
    );
    
    if (countNoHttp[0].total === 0) {
      console.log('\n⚠️ No se encontraron canciones con IDs de Google Drive.');
      console.log('Para agregar canciones de Google Drive, ejecuta primero:');
      console.log('node indexar_google_drive.js');
      return;
    }
    
    // Activar el uso de URLs externas para todas las canciones con IDs de Google Drive
    console.log('🔄 Actualizando configuración...');
    const [result] = await connection.query(
      `UPDATE canciones SET usar_url_externa = TRUE 
       WHERE url_externa IS NOT NULL 
       AND url_externa != "" 
       AND url_externa NOT LIKE "http%"`
    );
    
    console.log(`✅ Configuración actualizada: ${result.affectedRows} canciones ahora usarán Google Drive directamente`);
    
    // Verificar la configuración
    const [countTotal] = await connection.query('SELECT COUNT(*) as total FROM canciones');
    const [countGoogleDrive] = await connection.query(
      `SELECT COUNT(*) as total FROM canciones 
       WHERE usar_url_externa = TRUE 
       AND url_externa IS NOT NULL 
       AND url_externa NOT LIKE "http%"`
    );
    const [countMediaFire] = await connection.query(
      `SELECT COUNT(*) as total FROM canciones 
       WHERE usar_url_externa = TRUE 
       AND url_externa LIKE "http%"`
    );
    
    console.log(`\n📊 Estadísticas:`);
    console.log(`• Total de canciones en la base de datos: ${countTotal[0].total}`);
    console.log(`• Canciones configuradas para usar Google Drive: ${countGoogleDrive[0].total} (${Math.round((countGoogleDrive[0].total/countTotal[0].total)*100)}%)`);
    console.log(`• Canciones configuradas para usar MediaFire: ${countMediaFire[0].total} (${Math.round((countMediaFire[0].total/countTotal[0].total)*100)}%)`);
    
    if (countGoogleDrive[0].total < countTotal[0].total - countMediaFire[0].total) {
      console.log(`\n⚠️ Nota: Hay ${countTotal[0].total - countGoogleDrive[0].total - countMediaFire[0].total} canciones que no tienen URL externa.`);
      console.log('Estas canciones seguirán intentando usar archivos locales.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.sqlMessage) {
      console.error('Mensaje SQL:', error.sqlMessage);
    }
  } finally {
    await connection.end();
    console.log('\n✅ Proceso completado.');
  }
}

// Ejecutar función principal
activarGoogleDrive()
  .then(() => {
    console.log('\n🚀 Listo para iniciar el bot con Google Drive. Ejecuta: npm start');
  })
  .catch(error => {
    console.error('\n❌ Error general:', error);
    process.exit(1);
  });
