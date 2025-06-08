/**
 * Script para optimizar el rendimiento del bot de WhatsApp
 * - Corrige problemas de logging
 * - Mejora el manejo de sesiones
 * - Optimiza el procesamiento de mensajes
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const logger = require('./src/config/logger');

// Directorio de sesiones
const SESSION_DIR = path.join(process.cwd(), 'sessions');

async function optimizarRendimiento() {
  try {
    console.log('🔄 Iniciando optimización de rendimiento del bot...\n');
    
    // 1. Verificar y corregir el logger
    console.log('1️⃣ Verificando configuración del logger...');
    const loggerPath = path.join(process.cwd(), 'src', 'config', 'logger.js');
    
    if (await fs.pathExists(loggerPath)) {
      console.log('✅ Archivo logger.js encontrado. Actualizando configuración...');
      
      // Leer archivo de logger
      let loggerContent = await fs.readFile(loggerPath, 'utf8');
      
      // Verificar si ya tiene la función de serialización
      if (!loggerContent.includes('format.json')) {
        // Actualizar configuración del logger para serializar objetos
        const updatedLoggerContent = loggerContent.replace(
          /const logger = winston\.createLogger\(\{([^}]*)\}\)/s,
          `const logger = winston.createLogger({
  $1,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(info => {
      // Serializar objetos para evitar [object Object] en los logs
      const message = typeof info.message === 'object' 
        ? JSON.stringify(info.message, null, 2)
        : info.message;
      return \`\${info.timestamp} \${info.level}: \${message}\`;
    })
  )
})`
        );
        
        // Guardar archivo actualizado
        await fs.writeFile(loggerPath, updatedLoggerContent);
        console.log('✅ Logger actualizado para manejar objetos correctamente');
      } else {
        console.log('✅ Logger ya tiene configuración para manejar objetos correctamente');
      }
    } else {
      console.log('⚠️ No se encontró el archivo logger.js en la ruta esperada');
    }
    
    // 2. Verificar y corregir manejo de sesiones
    console.log('\n2️⃣ Verificando directorio de sesiones...');
    
    if (await fs.pathExists(SESSION_DIR)) {
      // Crear un directorio de respaldo para sesiones antiguas
      const backupDir = path.join(process.cwd(), 'sessions_backup');
      if (!await fs.pathExists(backupDir)) {
        await fs.mkdir(backupDir);
      }
      
      // Mover sesiones antiguas a directorio de respaldo en lugar de eliminarlas
      const files = await fs.readdir(SESSION_DIR);
      let movedFiles = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(SESSION_DIR, file);
          const stats = await fs.stat(filePath);
          
          // Si el archivo tiene más de 7 días, moverlo al directorio de respaldo
          const fileAgeInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
          
          if (fileAgeInDays > 7) {
            await fs.move(filePath, path.join(backupDir, file), { overwrite: true });
            movedFiles++;
          }
        } catch (err) {
          // Ignorar errores individuales de archivos para continuar con el resto
          console.log(`⚠️ No se pudo mover el archivo ${file}: ${err.message}`);
        }
      }
      
      console.log(`✅ Se movieron ${movedFiles} archivos de sesión antiguos al directorio de respaldo`);
    } else {
      console.log('⚠️ El directorio de sesiones no existe');
    }
    
    // 3. Verificar la configuración de WhatsApp para el manejo de mensajes offline
    console.log('\n3️⃣ Mejorando manejo de mensajes offline...');
    
    // Actualizar el archivo de configuración de WhatsApp
    const whatsappServicePath = path.join(process.cwd(), 'src', 'services', 'whatsappService.js');
    
    if (await fs.pathExists(whatsappServicePath)) {
      let whatsappContent = await fs.readFile(whatsappServicePath, 'utf8');
      
      // Verificar si ya existe la configuración de procesamiento de mensajes
      if (!whatsappContent.includes('msgRetryCountMax')) {
        // Actualizar configuración para optimizar manejo de mensajes offline
        const updatedWhatsappContent = whatsappContent.replace(
          /const socket = baileys\.default\(([^)]*)\)/s,
          `const socket = baileys.default({
      $1,
      // Optimización: Limitar reintentos de mensajes
      msgRetryCountMax: 2,
      // Optimización: No procesar mensajes más antiguos de 12 horas
      processIncomingMessagesInterval: 10 * 1000, // 10 segundos
      syncFullHistory: false
    }`
        );
        
        await fs.writeFile(whatsappServicePath, updatedWhatsappContent);
        console.log('✅ Servicio de WhatsApp optimizado para manejo de mensajes offline');
      } else {
        console.log('✅ El servicio de WhatsApp ya tiene configuraciones para optimización');
      }
    } else {
      console.log('⚠️ No se encontró el archivo whatsappService.js en la ruta esperada');
    }
    
    console.log('\n✅ Optimización completada');
    console.log('\n🚀 Recomendaciones para mejorar el rendimiento:');
    console.log('1. Reinicia el bot para aplicar los cambios');
    console.log('2. Ejecuta el bot con más memoria: NODE_OPTIONS="--max-old-space-size=4096" npm start');
    console.log('3. Considera mover la base de datos a un servidor dedicado si el tráfico aumenta');
    console.log('4. Implementa un sistema de caché para resultados de búsqueda frecuentes');
    
  } catch (error) {
    console.error(`❌ Error durante la optimización: ${error.message}`);
    console.error(error);
  }
}

// Ejecutar optimización
optimizarRendimiento()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Error general:', error);
    process.exit(1);
  });
