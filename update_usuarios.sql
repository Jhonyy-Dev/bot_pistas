-- Actualizar tabla usuarios para añadir campo es_primera_vez
USE bot_chiveros_peru;

-- Verificar si la columna ya existe
SET @existe_columna = 0;
SELECT COUNT(*) INTO @existe_columna FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'bot_chiveros_peru' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'es_primera_vez';

-- Añadir columna si no existe
SET @sql = IF(@existe_columna = 0, 
    'ALTER TABLE usuarios ADD COLUMN es_primera_vez BOOLEAN DEFAULT TRUE;',
    'SELECT "La columna es_primera_vez ya existe." AS mensaje;');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Actualizar usuarios existentes
UPDATE usuarios SET es_primera_vez = TRUE WHERE es_primera_vez IS NULL;
