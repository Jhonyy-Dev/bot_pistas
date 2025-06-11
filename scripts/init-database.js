/**
 * Script para inicializar la base de datos MySQL para BOT_PISTAS
 * Ejecuta el script SQL de creación de tablas y procedimientos almacenados
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Ruta al script SQL
const SQL_SCRIPT_PATH = path.join(__dirname, '..', 'crear_db.sql');

// Configuración de la conexión (sin especificar base de datos)
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 3306,
  ssl: process.env.DB_SSL === 'true' ? {
    // Configuración SSL básica
    rejectUnauthorized: false
  } : undefined,
  multipleStatements: true // Importante para ejecutar múltiples sentencias SQL
};

/**
 * Ejecuta el script SQL
 */
async function inicializarBaseDatos() {
  console.log('🔄 Inicializando base de datos...');
  
  let connection;
  
  try {
    // Leer el script SQL
    const sqlScript = fs.readFileSync(SQL_SCRIPT_PATH, 'utf8');
    
    // Crear conexión sin especificar base de datos
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Conexión a MySQL establecida');
    console.log('🔄 Ejecutando script SQL...');
    
    // Ejecutar el script SQL completo
    await connection.query(sqlScript);
    
    console.log('✅ Script SQL ejecutado correctamente');
    console.log('✅ Base de datos inicializada con éxito');
    
    // Verificar que se crearon las tablas
    const [rows] = await connection.query('USE bot_pistas; SHOW TABLES;');
    console.log('\n📊 Tablas creadas:');
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.Tables_in_bot_pistas}`);
    });
    
  } catch (error) {
    console.error('❌ Error inicializando la base de datos:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexión cerrada');
    }
    process.exit(0);
  }
}

// Ejecutar la inicialización
inicializarBaseDatos();
