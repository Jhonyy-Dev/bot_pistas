/**
 * Script para actualizar la estructura de la base de datos
 * - Aumenta el tamaño de la columna numero_telefono
 * - Verifica que existan las columnas para Google Drive
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Credenciales de base de datos desde .env
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'bot_chiveros_peru';

async function actualizarEstructuraDB() {
  let connection;
  
  try {
    console.log('🔄 Iniciando actualización de estructura de base de datos...');
    
    // Crear conexión
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    
    console.log('✅ Conexión a la base de datos establecida');
    
    // 1. Modificar columna numero_telefono en tabla usuarios
    console.log('\n1️⃣ Actualizando columna numero_telefono en tabla usuarios...');
    try {
      await connection.query(`
        ALTER TABLE usuarios 
        MODIFY COLUMN numero_telefono VARCHAR(50) UNIQUE NOT NULL
      `);
      console.log('✅ Columna numero_telefono aumentada a VARCHAR(50)');
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log('⚠️ Existen registros duplicados al intentar aplicar UNIQUE. Eliminando restricción...');
        // Si hay duplicados, primero eliminar la restricción UNIQUE
        await connection.query(`
          ALTER TABLE usuarios 
          MODIFY COLUMN numero_telefono VARCHAR(50) NOT NULL
        `);
        console.log('✅ Columna numero_telefono actualizada sin restricción UNIQUE');
      } else {
        throw error;
      }
    }
    
    // 2. Verificar y agregar columna url_externa si no existe
    console.log('\n2️⃣ Verificando columna url_externa en tabla canciones...');
    const [columnasUrlExterna] = await connection.query(`
      SHOW COLUMNS FROM canciones LIKE 'url_externa'
    `);
    
    if (columnasUrlExterna.length === 0) {
      await connection.query(`
        ALTER TABLE canciones 
        ADD COLUMN url_externa VARCHAR(255)
      `);
      console.log('✅ Columna url_externa añadida');
    } else {
      console.log('✅ Columna url_externa ya existe');
    }
    
    // 3. Verificar y agregar columna usar_url_externa si no existe
    console.log('\n3️⃣ Verificando columna usar_url_externa en tabla canciones...');
    const [columnasUsarUrl] = await connection.query(`
      SHOW COLUMNS FROM canciones LIKE 'usar_url_externa'
    `);
    
    if (columnasUsarUrl.length === 0) {
      await connection.query(`
        ALTER TABLE canciones 
        ADD COLUMN usar_url_externa BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Columna usar_url_externa añadida');
    } else {
      console.log('✅ Columna usar_url_externa ya existe');
    }
    
    // 4. Verificar campos en tabla usuarios para asegurar estructura correcta
    console.log('\n4️⃣ Verificando estructura correcta de tabla usuarios...');
    const [columnasEsPrimeraVez] = await connection.query(`
      SHOW COLUMNS FROM usuarios LIKE 'es_primera_vez'
    `);
    
    if (columnasEsPrimeraVez.length === 0) {
      await connection.query(`
        ALTER TABLE usuarios 
        ADD COLUMN es_primera_vez BOOLEAN DEFAULT TRUE
      `);
      console.log('✅ Columna es_primera_vez añadida');
    } else {
      console.log('✅ Columna es_primera_vez ya existe');
    }
    
    console.log('\n✅ Estructura de la base de datos actualizada correctamente');
    console.log('🚀 El bot ahora debería funcionar sin errores de estructura de base de datos.');
    
  } catch (error) {
    console.error(`\n❌ Error al actualizar estructura: ${error.message}`);
    console.error(error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Ejecutar la actualización
actualizarEstructuraDB()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Error general:', error);
    process.exit(1);
  });
