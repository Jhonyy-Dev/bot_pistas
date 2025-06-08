/**
 * Script de diagnóstico para verificar la configuración de Google Drive
 * Este script ayuda a identificar problemas de autenticación y permisos
 */
require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { google } = require('googleapis');

// ID de la carpeta de prueba en Google Drive
const TEST_FOLDER_ID = '1GpXY404tR-8e0B9WC40i3szlfUgy1p-s';

console.log('🔍 Iniciando diagnóstico de Google Drive...\n');

async function diagnosticarGoogleDrive() {
  try {
    // 1. Verificar archivo de credenciales
    console.log('1️⃣ Verificando archivo de credenciales...');
    const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`❌ Archivo de credenciales no encontrado en: ${credentialsPath}`);
    }
    
    console.log('✅ Archivo de credenciales encontrado');
    
    // 2. Validar contenido de credenciales
    console.log('\n2️⃣ Validando contenido de credenciales...');
    let credentials;
    try {
      credentials = require(credentialsPath);
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Formato de credenciales incompleto');
      }
      console.log(`✅ Formato de credenciales válido`);
      console.log(`📧 Email de la cuenta de servicio: ${credentials.client_email}`);
      console.log(`🔑 Private key presente: ${credentials.private_key ? 'Sí' : 'No'}`);
    } catch (error) {
      throw new Error(`❌ Credenciales inválidas: ${error.message}`);
    }
    
    // 3. Probar autenticación básica
    console.log('\n3️⃣ Probando autenticación básica...');
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ]
    });
    
    try {
      console.log('🔄 Autenticando con Google...');
      const authClient = await auth.getClient();
      console.log('✅ Autenticación exitosa');
    } catch (error) {
      console.error('❌ Error de autenticación:', error.message);
      if (error.message.includes('invalid_grant')) {
        console.error('\n⚠️ Error de credenciales inválidas. Posibles causas:');
        console.error('  • La cuenta de servicio no está activada');
        console.error('  • El reloj del sistema no está sincronizado');
        console.error('  • El proyecto de Google Cloud no tiene Drive API habilitada');
      }
      return;
    }
    
    // 4. Probar acceso a la API de Drive
    console.log('\n4️⃣ Probando acceso a la API de Drive...');
    const drive = google.drive({ version: 'v3', auth });
    
    try {
      console.log('🔄 Obteniendo información de la cuenta...');
      const about = await drive.about.get({
        fields: 'user'
      });
      console.log('✅ Conexión a Drive API exitosa');
      console.log(`👤 Conectado como: ${about.data.user.emailAddress || about.data.user.displayName || 'Usuario desconocido'}`);
    } catch (error) {
      console.error('❌ Error al acceder a Drive API:', error.message);
      if (error.message.includes('insufficientPermissions')) {
        console.error('\n⚠️ La API de Drive no está habilitada para este proyecto.');
        console.error('Activa la API en: https://console.cloud.google.com/apis/library/drive.googleapis.com');
      }
      return;
    }
    
    // 5. Probar acceso a la carpeta específica
    console.log('\n5️⃣ Probando acceso a la carpeta de archivos...');
    console.log(`🔄 Intentando listar archivos en carpeta ${TEST_FOLDER_ID}...`);
    
    try {
      const response = await drive.files.list({
        q: `'${TEST_FOLDER_ID}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType)',
        pageSize: 10
      });
      
      const { files } = response.data;
      
      if (files && files.length > 0) {
        console.log(`✅ Acceso exitoso a la carpeta. Encontrados ${files.length} archivos/carpetas:`);
        files.slice(0, 5).forEach(file => {
          const type = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
          console.log(`  ${type} ${file.name}`);
        });
        
        if (files.length > 5) {
          console.log(`  ... y ${files.length - 5} más`);
        }
      } else {
        console.log('⚠️ La carpeta existe pero está vacía o no tienes permisos para ver su contenido');
      }
    } catch (error) {
      console.error('❌ Error al acceder a la carpeta:', error.message);
      
      if (error.message.includes('File not found')) {
        console.error('\n⚠️ La carpeta especificada no existe o no tienes acceso a ella.');
        console.error(`Verifica que has compartido la carpeta con: ${credentials.client_email}`);
      } else if (error.message.includes('insufficientPermissions')) {
        console.error('\n⚠️ La cuenta de servicio no tiene permisos para acceder a esta carpeta.');
        console.error(`Comparte la carpeta con: ${credentials.client_email}`);
        console.error('Asegúrate de darle al menos permisos de "Lector"');
      }
      return;
    }
    
    // 6. Diagnóstico completo
    console.log('\n✅ ¡Diagnóstico completo!');
    console.log('Todas las verificaciones fueron exitosas. El servicio de Google Drive está correctamente configurado.');
    console.log('\n🚀 Ahora puedes ejecutar:');
    console.log('node indexar_google_drive.js');
    
  } catch (error) {
    console.error(`\n❌ Error en el diagnóstico: ${error.message}`);
  }
}

// Ejecutar diagnóstico
diagnosticarGoogleDrive().catch(error => {
  console.error('Error general:', error);
  process.exit(1);
});
