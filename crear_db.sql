-- ========================================================
-- Script de base de datos para BOT_PISTAS
-- Integración con Backblaze B2 para almacenamiento de MP3
-- Optimizado para alto volumen (250,000+ archivos MP3) y consultas concurrentes
-- Versión: 1.0
-- Fecha: 2025-06-10
-- ========================================================

-- Configuraciones recomendadas para el servidor MySQL (ejecutar como administrador)
-- Estas configuraciones deben agregarse a my.cnf o my.ini del servidor
/*
[mysqld]
# Optimizaciones para alto volumen de datos y consultas concurrentes
innodb_buffer_pool_size = 4G           # Ajustar según RAM disponible (50-80% de RAM total)
innodb_log_file_size = 512M            # Mejora rendimiento de escritura
innodb_flush_log_at_trx_commit = 2     # Balance entre rendimiento y seguridad
innodb_flush_method = O_DIRECT         # Reduce carga de I/O
max_connections = 500                  # Permitir más conexiones simultáneas
thread_cache_size = 128                # Mejora rendimiento con muchas conexiones
query_cache_size = 128M                # Cache para consultas repetidas
query_cache_limit = 2M                 # Límite por consulta en cache
table_open_cache = 4000                # Para muchas tablas abiertas simultáneamente
key_buffer_size = 256M                 # Para índices MyISAM
read_buffer_size = 2M                  # Buffer de lectura por conexión
read_rnd_buffer_size = 8M              # Buffer para lecturas ordenadas
sort_buffer_size = 8M                  # Buffer de ordenación por conexión
join_buffer_size = 8M                  # Buffer para joins por conexión
tmp_table_size = 256M                  # Tablas temporales en memoria
max_heap_table_size = 256M             # Tablas MEMORY
innodb_file_per_table = 1              # Una tabla por archivo (mejor para tablas grandes)
innodb_stats_on_metadata = 0           # Reduce bloqueos en metadatos
innodb_read_io_threads = 16            # Hilos de lectura
innodb_write_io_threads = 16           # Hilos de escritura
innodb_io_capacity = 2000              # Capacidad de I/O (ajustar según SSD/HDD)
innodb_thread_concurrency = 0          # Auto-ajuste de concurrencia
*/

-- Usar la base de datos (usar el nombre correcto con prefijo)
USE u487652187_bot_pistas;

-- ========================================================
-- TABLAS PRINCIPALES
-- ========================================================

-- Tabla de usuarios (clientes del bot)
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_telefono VARCHAR(20) UNIQUE NOT NULL COMMENT 'Número de teléfono con formato internacional',
    nombre VARCHAR(100) COMMENT 'Nombre del usuario (opcional)',
    creditos INT DEFAULT 10 COMMENT 'Créditos disponibles para descargas',
    es_admin BOOLEAN DEFAULT FALSE COMMENT 'Indica si el usuario es administrador',
    es_primera_vez BOOLEAN DEFAULT TRUE COMMENT 'Indica si es la primera vez que el usuario usa el bot',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_numero_telefono (numero_telefono),
    INDEX idx_es_admin (es_admin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de canciones (referencias a archivos en Backblaze B2)
-- Optimizada para manejar 250,000+ archivos MP3 y búsquedas concurrentes
CREATE TABLE IF NOT EXISTS canciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL COMMENT 'Nombre de la canción',
    artista VARCHAR(255) COMMENT 'Nombre del artista',
    album VARCHAR(255) DEFAULT NULL COMMENT 'Nombre del álbum',
    genero VARCHAR(100) DEFAULT NULL COMMENT 'Género musical',
    duracion VARCHAR(10) DEFAULT NULL COMMENT 'Duración en formato MM:SS',
    ruta_archivo VARCHAR(500) NOT NULL COMMENT 'Ruta completa del archivo en B2 o ID de Google Drive',
    tamanio_bytes INT DEFAULT NULL COMMENT 'Tamaño en bytes',
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url_externa VARCHAR(500) DEFAULT NULL COMMENT 'URL externa o ID de Google Drive',
    popularidad INT DEFAULT 0 COMMENT 'Contador de popularidad para ordenar resultados',
    hash_contenido VARCHAR(64) DEFAULT NULL COMMENT 'Hash SHA-256 para verificar integridad',
    
    -- Índices para búsqueda rápida (optimizados para alto volumen)
    INDEX idx_nombre_artista (nombre(50), artista(50)) COMMENT 'Índice compuesto para búsquedas por nombre y artista',
    INDEX idx_artista_nombre (artista(50), nombre(50)) COMMENT 'Índice compuesto para búsquedas por artista y nombre',
    INDEX idx_genero_popularidad (genero, popularidad) COMMENT 'Índice para búsquedas por género ordenadas por popularidad',
    UNIQUE INDEX idx_ruta_archivo (ruta_archivo(255)) COMMENT 'Índice único para evitar duplicados (limitado a 255 chars)',
    
    -- Índice de texto completo para búsqueda avanzada
    FULLTEXT INDEX idx_busqueda (nombre, artista, album) COMMENT 'Índice de texto completo con parser natural'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

-- Nota: El particionamiento se ha eliminado debido a restricciones en Hostinger
-- Para implementar particionamiento en un servidor que lo soporte, usar:
/*
ALTER TABLE canciones
PARTITION BY RANGE (TO_DAYS(fecha_subida)) (
    PARTITION p2023 VALUES LESS THAN (TO_DAYS('2024-01-01')),
    PARTITION p2024 VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION p2025 VALUES LESS THAN (TO_DAYS('2026-01-01')),
    PARTITION p2026 VALUES LESS THAN (TO_DAYS('2027-01-01')),
    PARTITION p2027 VALUES LESS THAN (TO_DAYS('2028-01-01')),
    PARTITION pfuture VALUES LESS THAN MAXVALUE
);
*/

-- Tabla de descargas
CREATE TABLE IF NOT EXISTS descargas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_cancion INT NOT NULL,
    fecha_descarga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    origen VARCHAR(50) DEFAULT 'local' COMMENT 'Origen de la descarga: local, google_drive, etc.',
    
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (id_cancion) REFERENCES canciones(id) ON DELETE CASCADE,
    INDEX idx_usuario (id_usuario),
    INDEX idx_cancion (id_cancion),
    INDEX idx_fecha (fecha_descarga)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de transacciones de créditos
CREATE TABLE IF NOT EXISTS transacciones_creditos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    cantidad INT NOT NULL COMMENT 'Cantidad de créditos (positivo: ingreso, negativo: gasto)',
    tipo ENUM('compra', 'uso', 'regalo', 'promocion', 'inicial') NOT NULL,
    descripcion VARCHAR(255) DEFAULT NULL,
    fecha_transaccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (id_usuario),
    INDEX idx_fecha (fecha_transaccion),
    INDEX idx_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de búsquedas fallidas (para mejorar el sistema)
CREATE TABLE IF NOT EXISTS busquedas_fallidas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    termino_busqueda VARCHAR(500) NOT NULL,
    usuario_whatsapp VARCHAR(20) NOT NULL,
    fecha_busqueda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_termino (termino_busqueda(255)),
    INDEX idx_fecha (fecha_busqueda)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de caché de búsquedas para optimizar consultas frecuentes
CREATE TABLE IF NOT EXISTS cache_busquedas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    termino_busqueda VARCHAR(255) NOT NULL,
    resultados JSON NOT NULL COMMENT 'Resultados serializados en formato JSON',
    hits INT DEFAULT 1 COMMENT 'Número de veces que se ha usado este caché',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_ultimo_uso TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expiracion TIMESTAMP DEFAULT (NOW() + INTERVAL 24 HOUR) COMMENT 'Cuándo expira este caché',
    
    UNIQUE INDEX idx_termino_unico (termino_busqueda),
    INDEX idx_hits (hits),
    INDEX idx_expiracion (expiracion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS configuracion (
    clave VARCHAR(50) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion VARCHAR(255) DEFAULT NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- PROCEDIMIENTOS ALMACENADOS
-- ========================================================

-- Procedimiento para buscar canciones con búsqueda avanzada optimizado para alto volumen
DELIMITER //
CREATE PROCEDURE buscar_canciones(
    IN termino VARCHAR(255),
    IN limite INT,
    IN offset_val INT,
    IN busqueda_exacta BOOLEAN
)
BEGIN
    DECLARE max_results INT DEFAULT 1000;
    DECLARE relevancia FLOAT;
    
    -- Validar parámetros
    IF limite IS NULL OR limite <= 0 THEN
        SET limite = 10;
    END IF;
    
    IF limite > max_results THEN
        SET limite = max_results;
    END IF;
    
    IF offset_val IS NULL OR offset_val < 0 THEN
        SET offset_val = 0;
    END IF;
    
    -- Usar búsqueda de texto completo con relevancia
    IF busqueda_exacta THEN
        -- Búsqueda exacta con mayor prioridad
        SELECT 
            id, nombre, artista, album, genero, duracion, ruta_archivo, 
            tamanio_bytes, fecha_subida, url_externa, popularidad,
            MATCH(nombre, artista, album) AGAINST(termino IN BOOLEAN MODE) AS relevancia
        FROM canciones 
        WHERE 
            nombre = termino OR 
            artista = termino OR
            MATCH(nombre, artista, album) AGAINST(CONCAT('"+"', termino) IN BOOLEAN MODE)
        ORDER BY 
            CASE 
                WHEN nombre = termino THEN 3
                WHEN artista = termino THEN 2
                ELSE 1
            END DESC,
            popularidad DESC,
            relevancia DESC
        LIMIT limite
        OFFSET offset_val;
    ELSE
        -- Búsqueda flexible para resultados más amplios
        SELECT 
            id, nombre, artista, album, genero, duracion, ruta_archivo, 
            tamanio_bytes, fecha_subida, url_externa, popularidad,
            MATCH(nombre, artista, album) AGAINST(termino IN NATURAL LANGUAGE MODE) AS relevancia
        FROM canciones 
        WHERE 
            MATCH(nombre, artista, album) AGAINST(termino IN NATURAL LANGUAGE MODE) OR
            nombre LIKE CONCAT('%', termino, '%') OR
            artista LIKE CONCAT('%', termino, '%') OR
            album LIKE CONCAT('%', termino, '%')
        ORDER BY 
            relevancia DESC,
            popularidad DESC,
            CASE 
                WHEN nombre LIKE CONCAT('%', termino, '%') THEN 3
                WHEN artista LIKE CONCAT('%', termino, '%') THEN 2
                WHEN album LIKE CONCAT('%', termino, '%') THEN 1
                ELSE 0
            END DESC
        LIMIT limite
        OFFSET offset_val;
    END IF;
    
    -- Incrementar contador de popularidad para los términos buscados
    -- (limitado a 100 actualizaciones para no sobrecargar)
    UPDATE canciones
    SET popularidad = popularidad + 1
    WHERE id IN (
        SELECT id FROM (
            SELECT id FROM canciones
            WHERE MATCH(nombre, artista, album) AGAINST(termino IN NATURAL LANGUAGE MODE)
            LIMIT 100
        ) AS temp
    );
    
END //
DELIMITER ;

-- Procedimiento para registrar búsqueda fallida
DELIMITER //
CREATE PROCEDURE registrar_busqueda_fallida(
    IN p_termino VARCHAR(500),
    IN p_usuario_whatsapp VARCHAR(20)
)
BEGIN
    INSERT INTO busquedas_fallidas (termino_busqueda, usuario_whatsapp)
    VALUES (p_termino, p_usuario_whatsapp);
END //
DELIMITER ;

-- Procedimiento para obtener estadísticas generales
DELIMITER //
CREATE PROCEDURE obtener_estadisticas()
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM canciones) AS total_canciones,
        (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
        (SELECT COUNT(*) FROM descargas) AS total_descargas,
        (SELECT COUNT(DISTINCT id_usuario) FROM descargas) AS usuarios_activos;
END //
DELIMITER ;

-- Procedimiento para añadir nueva canción
DELIMITER //
CREATE PROCEDURE agregar_cancion(
    IN p_nombre VARCHAR(255),
    IN p_artista VARCHAR(255),
    IN p_album VARCHAR(255),
    IN p_genero VARCHAR(100),
    IN p_duracion VARCHAR(10),
    IN p_ruta_archivo VARCHAR(500),
    IN p_tamanio_bytes INT,
    IN p_url_externa VARCHAR(500),
    OUT p_id INT
)
BEGIN
    INSERT INTO canciones (
        nombre, artista, album, genero, duracion, 
        ruta_archivo, tamanio_bytes, url_externa
    ) VALUES (
        p_nombre, p_artista, p_album, p_genero, p_duracion,
        p_ruta_archivo, p_tamanio_bytes, p_url_externa
    );
    
    SET p_id = LAST_INSERT_ID();
END //
DELIMITER ;

-- Procedimiento para registrar descarga (optimizado para concurrencia)
DELIMITER //
CREATE PROCEDURE registrar_descarga(
    IN p_id_usuario INT,
    IN p_id_cancion INT,
    IN p_origen VARCHAR(50)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Manejar errores y hacer rollback
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error al registrar descarga';
    END;
    
    -- Usar transacciones para garantizar atomicidad
    START TRANSACTION;
    
    -- Incrementar contador de popularidad de la canción
    UPDATE canciones
    SET popularidad = popularidad + 1
    WHERE id = p_id_cancion;
    
    -- Registrar la descarga
    INSERT INTO descargas (id_usuario, id_cancion, origen, fecha_descarga)
    VALUES (p_id_usuario, p_id_cancion, p_origen, NOW());
    
    -- Descontar un crédito al usuario (con bloqueo para evitar condiciones de carrera)
    UPDATE usuarios 
    SET creditos = creditos - 1 
    WHERE id = p_id_usuario AND creditos > 0;
    
    -- Verificar que el usuario tenía créditos suficientes
    IF ROW_COUNT() = 0 THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Créditos insuficientes';
    END IF;
    
    -- Registrar la transacción de créditos
    INSERT INTO transacciones_creditos (id_usuario, cantidad, tipo, descripcion, fecha_transaccion)
    VALUES (p_id_usuario, -1, 'uso', CONCAT('Descarga de canción ID: ', p_id_cancion), NOW());
    
    -- Confirmar la transacción
    COMMIT;
    
END //
DELIMITER ;

-- ========================================================
-- PROCEDIMIENTOS PARA GESTIÓN MASIVA DE CANCIONES
-- ========================================================

-- Procedimiento para insertar o actualizar canciones en lote desde Backblaze B2
DELIMITER //
CREATE PROCEDURE insertar_actualizar_canciones_lote(
    IN p_nombre VARCHAR(255),
    IN p_artista VARCHAR(255),
    IN p_album VARCHAR(255),
    IN p_genero VARCHAR(100),
    IN p_duracion VARCHAR(10),
    IN p_ruta_archivo VARCHAR(500),
    IN p_tamanio_bytes INT,
    IN p_hash_contenido VARCHAR(64)
)
BEGIN
    DECLARE cancion_id INT;
    
    -- Buscar si ya existe la canción por ruta_archivo
    SELECT id INTO cancion_id FROM canciones WHERE ruta_archivo = p_ruta_archivo LIMIT 1;
    
    IF cancion_id IS NOT NULL THEN
        -- Actualizar canción existente
        UPDATE canciones
        SET 
            nombre = COALESCE(p_nombre, nombre),
            artista = COALESCE(p_artista, artista),
            album = COALESCE(p_album, album),
            genero = COALESCE(p_genero, genero),
            duracion = COALESCE(p_duracion, duracion),
            tamanio_bytes = COALESCE(p_tamanio_bytes, tamanio_bytes),
            hash_contenido = COALESCE(p_hash_contenido, hash_contenido)
        WHERE id = cancion_id;
    ELSE
        -- Insertar nueva canción
        INSERT INTO canciones (
            nombre, artista, album, genero, duracion, 
            ruta_archivo, tamanio_bytes, fecha_subida, hash_contenido
        ) VALUES (
            p_nombre, p_artista, p_album, p_genero, p_duracion,
            p_ruta_archivo, p_tamanio_bytes, NOW(), p_hash_contenido
        );
    END IF;
END //
DELIMITER ;

-- Procedimiento para sincronizar canciones con Backblaze B2
DELIMITER //
CREATE PROCEDURE sincronizar_canciones_b2(
    IN p_limite INT
)
BEGIN
    DECLARE v_procesadas INT DEFAULT 0;
    DECLARE v_nuevas INT DEFAULT 0;
    DECLARE v_actualizadas INT DEFAULT 0;
    
    -- Crear tabla temporal para resultados
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_resultado_sync (
        procesadas INT,
        nuevas INT,
        actualizadas INT,
        timestamp TIMESTAMP DEFAULT NOW()
    );
    
    -- Registrar estadísticas (en un caso real, aquí iría la lógica de sincronización)
    INSERT INTO tmp_resultado_sync (procesadas, nuevas, actualizadas)
    VALUES (p_limite, v_nuevas, v_actualizadas);
    
    -- Devolver resultados
    SELECT * FROM tmp_resultado_sync ORDER BY timestamp DESC LIMIT 1;
    
    -- Limpiar tabla temporal
    DROP TEMPORARY TABLE IF EXISTS tmp_resultado_sync;
END //
DELIMITER ;

-- Procedimiento para buscar canciones con caché (optimizado para búsquedas concurrentes)
DELIMITER //
CREATE PROCEDURE buscar_canciones_cache(
    IN p_termino VARCHAR(255),
    IN p_limite INT,
    IN p_usar_cache BOOLEAN
)
BEGIN
    DECLARE v_cache_id INT;
    DECLARE v_cache_resultados JSON;
    DECLARE v_cache_encontrado BOOLEAN DEFAULT FALSE;
    
    -- Validar parámetros
    IF p_limite IS NULL OR p_limite <= 0 THEN
        SET p_limite = 10;
    END IF;
    
    -- Normalizar término de búsqueda para mejorar coincidencias en caché
    SET p_termino = LOWER(TRIM(p_termino));
    
    -- Verificar si debemos usar caché y si hay resultados en caché válidos
    IF p_usar_cache THEN
        -- Buscar en caché y actualizar contador de hits si existe
        SELECT id, resultados INTO v_cache_id, v_cache_resultados 
        FROM cache_busquedas 
        WHERE termino_busqueda = p_termino 
          AND expiracion > NOW() 
        LIMIT 1;
        
        IF v_cache_id IS NOT NULL THEN
            -- Actualizar contador de hits y fecha de último uso
            UPDATE cache_busquedas 
            SET hits = hits + 1, fecha_ultimo_uso = NOW() 
            WHERE id = v_cache_id;
            
            -- Devolver resultados desde caché
            SELECT 
                v_cache_resultados AS resultados_json,
                TRUE AS desde_cache,
                hits AS cache_hits
            FROM cache_busquedas
            WHERE id = v_cache_id;
            
            SET v_cache_encontrado = TRUE;
        END IF;
    END IF;
    
    -- Si no se encontró en caché o no se usa caché, realizar búsqueda normal
    IF NOT v_cache_encontrado THEN
        -- Crear tabla temporal para almacenar resultados
        DROP TEMPORARY TABLE IF EXISTS tmp_resultados_busqueda;
        CREATE TEMPORARY TABLE tmp_resultados_busqueda (
            id INT,
            nombre VARCHAR(255),
            artista VARCHAR(255),
            album VARCHAR(255),
            genero VARCHAR(100),
            duracion VARCHAR(10),
            ruta_archivo VARCHAR(500),
            tamanio_bytes INT,
            fecha_subida TIMESTAMP,
            popularidad INT,
            relevancia FLOAT
        );
        
        -- Insertar resultados en tabla temporal
        INSERT INTO tmp_resultados_busqueda
        SELECT 
            id, nombre, artista, album, genero, duracion, 
            ruta_archivo, tamanio_bytes, fecha_subida, popularidad,
            MATCH(nombre, artista, album) AGAINST(p_termino IN NATURAL LANGUAGE MODE) AS relevancia
        FROM canciones 
        WHERE 
            MATCH(nombre, artista, album) AGAINST(p_termino IN NATURAL LANGUAGE MODE) OR
            nombre LIKE CONCAT('%', p_termino, '%') OR
            artista LIKE CONCAT('%', p_termino, '%') OR
            album LIKE CONCAT('%', p_termino, '%')
        ORDER BY 
            relevancia DESC,
            popularidad DESC
        LIMIT p_limite;
        
        -- Convertir resultados a JSON
        SET v_cache_resultados = (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', id,
                    'nombre', nombre,
                    'artista', artista,
                    'album', album,
                    'genero', genero,
                    'duracion', duracion,
                    'ruta_archivo', ruta_archivo,
                    'tamanio_bytes', tamanio_bytes,
                    'fecha_subida', fecha_subida,
                    'popularidad', popularidad,
                    'relevancia', relevancia
                )
            )
            FROM tmp_resultados_busqueda
        );
        
        -- Guardar en caché si hay resultados
        IF v_cache_resultados IS NOT NULL AND p_usar_cache THEN
            INSERT INTO cache_busquedas (termino_busqueda, resultados, hits)
            VALUES (p_termino, v_cache_resultados, 1)
            ON DUPLICATE KEY UPDATE 
                resultados = VALUES(resultados),
                hits = hits + 1,
                fecha_ultimo_uso = NOW(),
                expiracion = (NOW() + INTERVAL 24 HOUR);
        END IF;
        
        -- Devolver resultados
        SELECT 
            id, nombre, artista, album, genero, duracion, 
            ruta_archivo, tamanio_bytes, fecha_subida, popularidad, relevancia,
            FALSE AS desde_cache
        FROM tmp_resultados_busqueda
        ORDER BY relevancia DESC, popularidad DESC;
        
        -- Limpiar tabla temporal
        DROP TEMPORARY TABLE IF EXISTS tmp_resultados_busqueda;
    END IF;
END //
DELIMITER ;

-- ========================================================
-- DATOS INICIALES
-- ========================================================

-- Procedimiento para mantenimiento automático de la base de datos
-- Optimiza índices, limpia caché expirado y actualiza estadísticas
DELIMITER //
CREATE PROCEDURE mantenimiento_db()
BEGIN
    DECLARE v_tablas_optimizadas INT DEFAULT 0;
    DECLARE v_registros_cache_eliminados INT DEFAULT 0;
    
    -- Limpiar caché expirado o con pocos hits
    DELETE FROM cache_busquedas 
    WHERE expiracion < NOW() OR (hits < 3 AND fecha_ultimo_uso < (NOW() - INTERVAL 7 DAY));
    
    SET v_registros_cache_eliminados = ROW_COUNT();
    
    -- Optimizar tablas principales (solo ejecutar en horarios de bajo tráfico)
    OPTIMIZE TABLE canciones, usuarios, descargas, transacciones_creditos;
    
    -- Actualizar estadísticas para el optimizador de consultas
    ANALYZE TABLE canciones, usuarios, descargas, transacciones_creditos, cache_busquedas;
    
    -- Registrar resultado del mantenimiento
    INSERT INTO configuracion (clave, valor, descripcion)
    VALUES (
        CONCAT('mantenimiento_', DATE_FORMAT(NOW(), '%Y%m%d')),
        CONCAT('{"cache_limpiados":', v_registros_cache_eliminados, ', "timestamp":"', NOW(), '"}'),
        'Registro de mantenimiento automático'
    )
    ON DUPLICATE KEY UPDATE 
        valor = VALUES(valor),
        fecha_actualizacion = NOW();
    
    -- Devolver resultados
    SELECT 
        'Mantenimiento completado' AS estado,
        v_registros_cache_eliminados AS cache_limpiados,
        NOW() AS timestamp;
    
END //
DELIMITER ;

-- Configuración inicial del sistema
INSERT INTO configuracion (clave, valor, descripcion) VALUES
('mensaje_bienvenida', '¡Bienvenido al Bot de Pistas! Envía el nombre de una canción para buscarla.', 'Mensaje de bienvenida para nuevos usuarios'),
('mensaje_no_encontrado', 'Lo siento, no encontré esa canción. Intenta con otro nombre.', 'Mensaje cuando no se encuentra una canción'),
('max_resultados_busqueda', '5', 'Número máximo de resultados por búsqueda'),
('version_app', '1.0.0', 'Versión actual de la aplicación'),
('b2_bucket_name', 'pistas', 'Nombre del bucket en Backblaze B2'),
('b2_endpoint', 'https://s3.us-west-005.backblazeb2.com', 'Endpoint de Backblaze B2'),
('max_conexiones_concurrentes', '200', 'Número máximo de conexiones concurrentes permitidas'),
('tiempo_cache_busquedas', '24', 'Tiempo en horas que se mantienen las búsquedas en caché');

-- Insertar canción de ejemplo (la que ya tienes subida)
INSERT INTO canciones (
    nombre, 
    artista, 
    album, 
    genero,
    ruta_archivo,
    tamanio_bytes,
    fecha_subida
) VALUES (
    'Mil Pedazos / No Se Puede Morir de Amor / Miento / Donde Estas Amor',
    'Centella',
    'Mix Romántico',
    'Salsa Romántica',
    'centella - mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',
    27195392, -- Aproximadamente 25.9 MB en bytes
    NOW()
);

-- Insertar usuario administrador por defecto
INSERT INTO usuarios (numero_telefono, nombre, creditos, es_admin, es_primera_vez) VALUES
('admin', 'Administrador', 999, TRUE, FALSE);
