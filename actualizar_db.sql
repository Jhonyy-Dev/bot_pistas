-- Script para actualizar la estructura de la base de datos

-- Usar la base de datos
USE bot_chiveros_peru;

-- Modificar la columna numero_telefono para aumentar su tamaño
ALTER TABLE usuarios 
MODIFY COLUMN numero_telefono VARCHAR(50) UNIQUE NOT NULL;

-- Verificar si las columnas url_externa y usar_url_externa existen
-- Si no existen, crearlas
SET @existe_url_externa = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'bot_chiveros_peru'
    AND TABLE_NAME = 'canciones'
    AND COLUMN_NAME = 'url_externa'
);

-- Añadir columna url_externa si no existe
SET @sql_url_externa = IF(@existe_url_externa = 0,
    'ALTER TABLE canciones ADD COLUMN url_externa VARCHAR(255)',
    'SELECT "Columna url_externa ya existe" AS mensaje'
);

PREPARE stmt1 FROM @sql_url_externa;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- Verificar si columna usar_url_externa existe
SET @existe_usar_url_externa = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'bot_chiveros_peru'
    AND TABLE_NAME = 'canciones'
    AND COLUMN_NAME = 'usar_url_externa'
);

-- Añadir columna usar_url_externa si no existe
SET @sql_usar_url_externa = IF(@existe_usar_url_externa = 0,
    'ALTER TABLE canciones ADD COLUMN usar_url_externa BOOLEAN DEFAULT FALSE',
    'SELECT "Columna usar_url_externa ya existe" AS mensaje'
);

PREPARE stmt2 FROM @sql_usar_url_externa;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Mostrar confirmación
SELECT 'Estructura de la base de datos actualizada correctamente' AS Resultado;
