/**
 * Script de prueba simple para verificar la conexión con Backblaze B2
 * Este script usa directamente el SDK de AWS S3 sin depender de otros servicios
 */

require('dotenv').config();
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// Función para mostrar información de configuración
function mostrarConfiguracion() {
  console.log('🔧 Configuración de Backblaze B2:');
  console.log(`- Región: ${process.env.B2_REGION}`);
  console.log(`- Endpoint: ${process.env.B2_ENDPOINT}`);
  console.log(`- Bucket: ${process.env.B2_BUCKET_NAME}`);
  console.log(`- Access Key: ${process.env.B2_ACCESS_KEY ? process.env.B2_ACCESS_KEY.substring(0, 5) + '...' : 'No definido'}`);
  console.log(`- Secret Key: ${process.env.B2_SECRET_KEY ? '***********' : 'No definido'}`);
}

// Crear cliente S3 para Backblaze B2
async function probarConexion() {
  console.log('🔄 Iniciando prueba de conexión con Backblaze B2...');
  
  try {
    // Mostrar configuración
    mostrarConfiguracion();
    
    // Crear cliente S3
    console.log('\n🔌 Creando cliente S3...');
    const s3Client = new S3Client({
      region: process.env.B2_REGION,
      endpoint: process.env.B2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.B2_ACCESS_KEY,
        secretAccessKey: process.env.B2_SECRET_KEY
      },
      forcePathStyle: true // Importante para Backblaze B2
    });
    
    console.log('✅ Cliente S3 creado');
    
    // Intentar listar objetos en el bucket
    console.log(`\n📋 Listando objetos en el bucket "${process.env.B2_BUCKET_NAME}"...`);
    
    const command = new ListObjectsV2Command({
      Bucket: process.env.B2_BUCKET_NAME
    });
    
    console.log('⏳ Enviando solicitud a Backblaze B2...');
    const response = await s3Client.send(command);
    
    console.log('✅ Conexión exitosa!');
    console.log(`📊 Objetos encontrados: ${response.Contents ? response.Contents.length : 0}`);
    
    if (response.Contents && response.Contents.length > 0) {
      console.log('\n📄 Primeros 5 objetos:');
      response.Contents.slice(0, 5).forEach((objeto, index) => {
        console.log(`${index + 1}. ${objeto.Key} (${(objeto.Size / 1024 / 1024).toFixed(2)} MB)`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error de conexión:', error.message);
    console.error('Detalles del error:');
    console.error(error);
    
    // Sugerencias para resolver problemas comunes
    console.log('\n🔍 Posibles soluciones:');
    console.log('1. Verifica que las credenciales (access key y secret key) sean correctas');
    console.log('2. Asegúrate de que el endpoint sea correcto (formato: https://s3.REGION.backblazeb2.com)');
    console.log('3. Verifica que el bucket "pistas" exista y sea accesible con tus credenciales');
    console.log('4. Comprueba tu conexión a internet');
  }
}

// Ejecutar prueba
probarConexion();
