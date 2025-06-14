#!/usr/bin/env node

/**
 * SINCRONIZADOR MASIVO BACKBLAZE B2 → MYSQL
 * Diseñado para manejar 250,000+ archivos MP3
 * 
 * Características:
 * - Procesamiento en lotes (batches)
 * - Reintentos automáticos
 * - Monitoreo de progreso
 * - Transacciones optimizadas
 * - Paralelización controlada
 */

require('dotenv').config();
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const mysql = require('mysql2/promise');
const fs = require('fs-extra');
const path = require('path');

// Configuración optimizada para alto volumen
const CONFIG = {
    // Tamaños de lote para procesamiento
    BATCH_SIZE: 1000,           // Archivos por lote
    MAX_CONCURRENT: 5,          // Conexiones paralelas máximas
    
    // Reintentos y timeouts
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,          // 2 segundos
    REQUEST_TIMEOUT: 30000,     // 30 segundos
    
    // Logging y monitoreo
    LOG_INTERVAL: 100,          // Log cada 100 archivos procesados
    PROGRESS_FILE: './sync_progress.json',
    
    // Límites de memoria
    MAX_MEMORY_MB: 512,         // Límite de memoria en MB
};

// Configurar AWS S3 Client para Backblaze B2 (SDK v3)
const s3Client = new S3Client({
    region: process.env.B2_REGION || 'us-west-005',
    endpoint: process.env.B2_ENDPOINT || 'https://s3.us-west-005.backblazeb2.com',
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.B2_ACCESS_KEY || '005cd14d66fc788705e08463dabf76d61791ecb4b9',
        secretAccessKey: process.env.B2_SECRET_KEY || 'K005pGnpw7tRrnTMIAleGDv80UNdpJI',
    },
    requestHandler: {
        requestTimeout: CONFIG.REQUEST_TIMEOUT,
        connectionTimeout: 10000,
    },
    maxAttempts: CONFIG.MAX_RETRIES,
});

// Pool de conexiones MySQL optimizado
let dbPool;

/**
 * Inicializar conexión a base de datos
 */
async function initDatabase() {
    try {
        dbPool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: CONFIG.MAX_CONCURRENT * 2,
            queueLimit: 0,
            // Opciones correctas para mysql2
            acquireTimeout: 60000,      // Tiempo máximo para obtener conexión del pool
            idleTimeout: 10000,         // Tiempo máximo de inactividad antes de cerrar conexión
            enableKeepAlive: true,      // Mantener conexiones activas
            keepAliveInitialDelay: 0,   // Delay inicial para keep-alive
            charset: 'utf8mb4',
            timezone: '+00:00'
        });

        // Probar conexión
        const connection = await dbPool.getConnection();
        await connection.ping();
        connection.release();
        
        console.log('✅ Conexión a MySQL establecida');
        return true;
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error.message);
        return false;
    }
}

/**
 * Obtener progreso guardado
 */
async function getProgress() {
    try {
        if (await fs.pathExists(CONFIG.PROGRESS_FILE)) {
            const data = await fs.readJSON(CONFIG.PROGRESS_FILE);
            return data;
        }
    } catch (error) {
        console.warn('⚠️ No se pudo leer progreso anterior:', error.message);
    }
    
    return {
        lastProcessedKey: null,
        totalProcessed: 0,
        totalFiles: 0,
        startTime: new Date().toISOString(),
        batches: []
    };
}

/**
 * Guardar progreso
 */
async function saveProgress(progress) {
    try {
        await fs.writeJSON(CONFIG.PROGRESS_FILE, progress, { spaces: 2 });
    } catch (error) {
        console.error('❌ Error guardando progreso:', error.message);
    }
}

/**
 * Listar TODOS los archivos MP3 de Backblaze B2 (paginado)
 */
async function listarTodosLosArchivos(progress) {
    const allFiles = [];
    let continuationToken = null;
    let totalSize = 0;
    
    console.log('🔍 Iniciando listado masivo de archivos MP3...');
    
    try {
        do {
            const params = {
                Bucket: process.env.B2_BUCKET_NAME || 'pistas',
                MaxKeys: 1000, // Máximo por página
                ContinuationToken: continuationToken
            };
            
            const command = new ListObjectsV2Command(params);
            const response = await s3Client.send(command);
            
            if (response.Contents && response.Contents.length > 0) {
                // Filtrar solo archivos MP3
                const mp3Files = response.Contents.filter(file => 
                    file.Key.toLowerCase().endsWith('.mp3') &&
                    file.Size > 0 // Evitar archivos vacíos
                );
                
                allFiles.push(...mp3Files);
                totalSize += mp3Files.reduce((sum, file) => sum + file.Size, 0);
                
                // Log progreso cada 10000 archivos
                if (allFiles.length % 10000 === 0) {
                    console.log(`📊 Archivos encontrados: ${allFiles.length.toLocaleString()}`);
                    console.log(`💾 Tamaño total: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
                }
            }
            
            continuationToken = response.NextContinuationToken;
            
        } while (continuationToken);
        
        console.log(`✅ Listado completo: ${allFiles.length.toLocaleString()} archivos MP3`);
        console.log(`💾 Tamaño total: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        
        return allFiles;
        
    } catch (error) {
        console.error('❌ Error listando archivos:', error.message);
        throw error;
    }
}

/**
 * Procesar un lote de archivos
 */
async function procesarLote(files, batchNumber, totalBatches) {
    const connection = await dbPool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Preparar datos para inserción masiva
        const values = [];
        const placeholders = [];
        
        for (const file of files) {
            const fileName = path.basename(file.Key, '.mp3');
            
            // Extraer información básica del nombre del archivo
            const parts = fileName.split(' - ');
            const artista = parts.length > 1 ? parts[0].trim() : 'Desconocido';
            const nombre = parts.length > 1 ? parts.slice(1).join(' - ').trim() : fileName;
            
            values.push(
                nombre,                    // nombre
                artista,                   // artista
                'Desconocido',            // album
                'Desconocido',            // genero
                null,                     // duracion
                file.Key,                 // ruta_archivo
                file.Size,                // tamanio_bytes
                new Date(file.LastModified), // fecha_subida
                null,                     // url_externa
                0                         // popularidad
            );
            
            placeholders.push('(?,?,?,?,?,?,?,?,?,?)');
        }
        
        // Inserción masiva con ON DUPLICATE KEY UPDATE
        const sql = `
            INSERT INTO canciones (
                nombre, artista, album, genero, duracion, 
                ruta_archivo, tamanio_bytes, fecha_subida, url_externa, popularidad
            ) VALUES ${placeholders.join(', ')}
            ON DUPLICATE KEY UPDATE
                tamanio_bytes = VALUES(tamanio_bytes),
                fecha_subida = VALUES(fecha_subida),
                popularidad = popularidad + 1
        `;
        
        await connection.execute(sql, values);
        await connection.commit();
        
        console.log(`✅ Lote ${batchNumber}/${totalBatches} completado (${files.length} archivos)`);
        
    } catch (error) {
        await connection.rollback();
        console.error(`❌ Error en lote ${batchNumber}:`, error.message);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Función principal de sincronización
 */
async function sincronizarMasivo() {
    console.log('🚀 INICIANDO SINCRONIZACIÓN MASIVA BACKBLAZE B2 → MYSQL');
    console.log('=' .repeat(60));
    
    const startTime = Date.now();
    let progress = await getProgress();
    
    try {
        // 1. Inicializar base de datos
        const dbReady = await initDatabase();
        if (!dbReady) {
            throw new Error('No se pudo conectar a la base de datos');
        }
        
        // 2. Listar todos los archivos
        console.log('\n📋 FASE 1: Listando archivos en Backblaze B2...');
        const allFiles = await listarTodosLosArchivos(progress);
        
        if (allFiles.length === 0) {
            console.log('⚠️ No se encontraron archivos MP3 en Backblaze B2');
            return;
        }
        
        // 3. Dividir en lotes
        const batches = [];
        for (let i = 0; i < allFiles.length; i += CONFIG.BATCH_SIZE) {
            batches.push(allFiles.slice(i, i + CONFIG.BATCH_SIZE));
        }
        
        console.log(`\n📦 FASE 2: Procesando ${batches.length.toLocaleString()} lotes de ${CONFIG.BATCH_SIZE} archivos`);
        
        // 4. Procesar lotes
        let processedBatches = 0;
        let totalProcessed = 0;
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            
            try {
                await procesarLote(batch, i + 1, batches.length);
                processedBatches++;
                totalProcessed += batch.length;
                
                // Actualizar progreso
                progress.totalProcessed = totalProcessed;
                progress.lastProcessedKey = batch[batch.length - 1].Key;
                await saveProgress(progress);
                
                // Log progreso cada cierto número de lotes
                if ((i + 1) % 10 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const rate = totalProcessed / elapsed;
                    const eta = (allFiles.length - totalProcessed) / rate;
                    
                    console.log(`\n📊 PROGRESO:`);
                    console.log(`   Lotes procesados: ${processedBatches}/${batches.length}`);
                    console.log(`   Archivos procesados: ${totalProcessed.toLocaleString()}/${allFiles.length.toLocaleString()}`);
                    console.log(`   Velocidad: ${rate.toFixed(1)} archivos/seg`);
                    console.log(`   Tiempo transcurrido: ${(elapsed / 60).toFixed(1)} min`);
                    console.log(`   Tiempo estimado restante: ${(eta / 60).toFixed(1)} min`);
                }
                
                // Pausa pequeña para no saturar
                if (i % 100 === 0 && i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (error) {
                console.error(`❌ Error procesando lote ${i + 1}:`, error.message);
                
                // Intentar continuar con el siguiente lote
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        // 5. Resumen final
        const totalTime = (Date.now() - startTime) / 1000;
        const avgRate = totalProcessed / totalTime;
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 SINCRONIZACIÓN COMPLETADA');
        console.log('='.repeat(60));
        console.log(`✅ Archivos procesados: ${totalProcessed.toLocaleString()}`);
        console.log(`⏱️ Tiempo total: ${(totalTime / 60).toFixed(1)} minutos`);
        console.log(`🚀 Velocidad promedio: ${avgRate.toFixed(1)} archivos/seg`);
        console.log(`💾 Tamaño total: ${(allFiles.reduce((sum, f) => sum + f.Size, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        
        // Limpiar archivo de progreso
        await fs.remove(CONFIG.PROGRESS_FILE);
        
    } catch (error) {
        console.error('\n❌ ERROR CRÍTICO:', error.message);
        console.error('💾 Progreso guardado en:', CONFIG.PROGRESS_FILE);
        process.exit(1);
    } finally {
        if (dbPool) {
            await dbPool.end();
        }
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    sincronizarMasivo().catch(console.error);
}

module.exports = { sincronizarMasivo };
