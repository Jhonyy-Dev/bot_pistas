/**
 * Script de instalación para Bot Chiveros Perú
 * Este script guía al usuario a través del proceso de instalación
 */

const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Crear interfaz de línea de comandos
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Preguntar al usuario
const question = (query) => new Promise(resolve => rl.question(query, resolve));

// Mensaje de inicio
console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '      Instalación de Bot Chiveros Perú');
console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('');

// Función principal de instalación
async function instalar() {
  try {
    console.log('\x1b[33m%s\x1b[0m', '📋 Verificando requisitos previos...');
    
    // Verificar Node.js
    try {
      const nodeVersion = execSync('node -v').toString().trim();
      console.log(`✅ Node.js detectado: ${nodeVersion}`);
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', '❌ Error: No se detectó Node.js. Por favor, instálalo antes de continuar.');
      process.exit(1);
    }
    
    // Verificar npm
    try {
      const npmVersion = execSync('npm -v').toString().trim();
      console.log(`✅ npm detectado: ${npmVersion}`);
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', '❌ Error: No se detectó npm. Por favor, instálalo antes de continuar.');
      process.exit(1);
    }
    
    console.log('\x1b[33m%s\x1b[0m', '🔧 Configurando el entorno...');
    
    // Verificar archivo .env
    if (!fs.existsSync(path.join(__dirname, '.env'))) {
      console.log('⚙️ Creando archivo .env...');
      
      // Obtener configuración de base de datos
      console.log('\x1b[36m%s\x1b[0m', '\n--- Configuración de la Base de Datos MySQL ---');
      
      const dbHost = await question('Host de MySQL [localhost]: ') || 'localhost';
      const dbPort = await question('Puerto de MySQL [3306]: ') || '3306';
      const dbName = await question('Nombre de la base de datos [bot_chiveros_peru]: ') || 'bot_chiveros_peru';
      const dbUser = await question('Usuario de MySQL [root]: ') || 'root';
      const dbPass = await question('Contraseña de MySQL: ');
      
      // Generar .env
      const envContent = `# Configuración del servidor
PORT=3000
NODE_ENV=development

# Configuración de la base de datos
DB_HOST=${dbHost}
DB_PORT=${dbPort}
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASSWORD=${dbPass}

# Configuración de WhatsApp
SESSION_FOLDER=./sessions
MP3_FOLDER=./mp3

# Configuración de logs
LOG_LEVEL=info`;
      
      fs.writeFileSync(path.join(__dirname, '.env'), envContent);
      console.log('✅ Archivo .env creado correctamente');
    } else {
      console.log('✅ Archivo .env ya existe');
    }
    
    // Instalar dependencias
    console.log('\x1b[33m%s\x1b[0m', '\n📦 Instalando dependencias...');
    console.log('Este proceso puede tardar unos minutos...');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      console.log('✅ Dependencias instaladas correctamente');
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', '❌ Error al instalar dependencias:', error.message);
      process.exit(1);
    }
    
    // Crear directorios necesarios
    console.log('\x1b[33m%s\x1b[0m', '\n📁 Creando directorios necesarios...');
    
    const dirs = ['mp3', 'sessions', 'logs'];
    for (const dir of dirs) {
      await fs.ensureDir(path.join(__dirname, dir));
      console.log(`✅ Directorio ${dir} creado/verificado`);
    }
    
    // Preguntar si desea configurar los números de administradores
    console.log('\x1b[36m%s\x1b[0m', '\n--- Configuración de Administradores ---');
    const configurarAdmins = await question('¿Desea configurar números de administradores ahora? (s/n): ');
    
    if (configurarAdmins.toLowerCase() === 's') {
      const adminFile = path.join(__dirname, 'src', 'controllers', 'adminController.js');
      const adminContent = fs.readFileSync(adminFile, 'utf8');
      
      // Solicitar números de administradores
      const admin1 = await question('Número de teléfono del primer administrador (sin +): ');
      const admin2 = await question('Número de teléfono del segundo administrador (opcional, sin +): ');
      
      // Crear array de administradores
      const adminArray = [admin1];
      if (admin2) adminArray.push(admin2);
      
      // Reemplazar en el archivo
      const newAdminContent = adminContent.replace(
        /const ADMIN_NUMBERS = \['ADMIN_NUMBER_1', 'ADMIN_NUMBER_2'\];/,
        `const ADMIN_NUMBERS = ['${adminArray.join("', '")}'];`
      );
      
      fs.writeFileSync(adminFile, newAdminContent);
      console.log('✅ Números de administradores configurados correctamente');
    }
    
    // Ofrecer importar MP3 de ejemplo
    console.log('\x1b[36m%s\x1b[0m', '\n--- MP3 de ejemplo ---');
    const importarEjemplos = await question('¿Desea importar algunos MP3 de ejemplo? (s/n): ');
    
    if (importarEjemplos.toLowerCase() === 's') {
      console.log('📂 Por favor, coloque sus archivos MP3 en la carpeta mp3/ antes de continuar.');
      await question('Presione Enter cuando haya colocado los archivos...');
    }
    
    console.log('\x1b[32m%s\x1b[0m', '\n✨ ¡Instalación completada con éxito! ✨');
    console.log('\nPara iniciar el bot:');
    console.log('  1. Asegúrese de que MySQL esté en ejecución');
    console.log('  2. Ejecute el script de creación de base de datos:');
    console.log('     - En MySQL: source crear_db.sql');
    console.log('  3. Ejecute el siguiente comando para iniciar el bot:');
    console.log('     npm start');
    console.log('\nUna vez iniciado, escanee el código QR que aparecerá en la consola con WhatsApp.');
    
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Error durante la instalación:', error.message);
  } finally {
    rl.close();
  }
}

// Ejecutar instalación
instalar().catch(console.error);
