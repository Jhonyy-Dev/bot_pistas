-- Modificar la tabla canciones para añadir un campo que almacene la URL de MediaFire
USE bot_chiveros_peru;

-- Añadir columna url_externa si no existe
ALTER TABLE canciones ADD COLUMN url_externa VARCHAR(255) NULL COMMENT 'URL externa del archivo (MediaFire, etc.)' AFTER ruta_archivo;

-- Añadir columna para controlar si se usa la URL externa o el archivo local
ALTER TABLE canciones ADD COLUMN usar_url_externa BOOLEAN DEFAULT FALSE COMMENT 'Si es TRUE, se usa url_externa en lugar de ruta_archivo';

-- Actualizar la URL base de MediaFire
UPDATE canciones SET url_externa = CONCAT('https://www.mediafire.com/folder/7q878v9bbht1t/bot_chiveros_peru/', ruta_archivo);

-- Por defecto, no usamos la URL externa todavía hasta confirmar que funciona
UPDATE canciones SET usar_url_externa = FALSE;
