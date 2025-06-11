-- Script para actualizar la estructura de la base de datos de usuarios
-- Fecha: 2025-06-10

-- Usar la base de datos
USE u487652187bot_pistas;

-- Verificar si la tabla usuarios existe y tiene la estructura correcta
-- Si no existe, crearla según el modelo actual

-- Verificar si la tabla usuarios existe
SET @tabla_existe = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'u487652187bot_pistas'
    AND TABLE_NAME = 'usuarios'
);

-- Si la tabla no existe, crearla
SET @sql_crear_tabla = IF(@tabla_existe = 0,
    'CREATE TABLE usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        numero_telefono VARCHAR(20) UNIQUE NOT NULL,
        nombre VARCHAR(100),
        creditos INT DEFAULT 10,
        es_admin BOOLEAN DEFAULT FALSE,
        es_primera_vez BOOLEAN DEFAULT TRUE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ultimo_acceso TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    'SELECT "Tabla usuarios ya existe" AS mensaje'
);

PREPARE stmt1 FROM @sql_crear_tabla;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- Verificar si la columna creditos existe
SET @existe_creditos = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'u487652187bot_pistas'
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'creditos'
);

-- Añadir columna creditos si no existe
SET @sql_creditos = IF(@existe_creditos = 0,
    'ALTER TABLE usuarios ADD COLUMN creditos INT DEFAULT 10',
    'SELECT "Columna creditos ya existe" AS mensaje'
);

PREPARE stmt2 FROM @sql_creditos;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Verificar si la columna es_primera_vez existe
SET @existe_primera_vez = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'u487652187bot_pistas'
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'es_primera_vez'
);

-- Añadir columna es_primera_vez si no existe
SET @sql_primera_vez = IF(@existe_primera_vez = 0,
    'ALTER TABLE usuarios ADD COLUMN es_primera_vez BOOLEAN DEFAULT TRUE',
    'SELECT "Columna es_primera_vez ya existe" AS mensaje'
);

PREPARE stmt3 FROM @sql_primera_vez;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- Verificar si la tabla transaccion_creditos existe
SET @tabla_transacciones_existe = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'u487652187bot_pistas'
    AND TABLE_NAME = 'transaccion_creditos'
);

-- Si la tabla no existe, crearla
SET @sql_crear_transacciones = IF(@tabla_transacciones_existe = 0,
    'CREATE TABLE transaccion_creditos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_usuario INT NOT NULL,
        cantidad INT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        descripcion VARCHAR(255),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    'SELECT "Tabla transaccion_creditos ya existe" AS mensaje'
);

PREPARE stmt4 FROM @sql_crear_transacciones;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- Mostrar confirmación
SELECT 'Estructura de la base de datos de usuarios actualizada correctamente' AS Resultado;
