-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS bot_chiveros_peru;

-- Usar la base de datos
USE bot_chiveros_peru;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_telefono VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100),
    creditos INT DEFAULT 0,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de canciones
CREATE TABLE IF NOT EXISTS canciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    artista VARCHAR(255),
    album VARCHAR(255),
    genero VARCHAR(100),
    duracion VARCHAR(10),
    ruta_archivo VARCHAR(500) UNIQUE NOT NULL,
    tamanio_bytes INT,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de descargas (historial)
CREATE TABLE IF NOT EXISTS descargas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_cancion INT NOT NULL,
    fecha_descarga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (id_cancion) REFERENCES canciones(id) ON DELETE CASCADE
);

-- Tabla de transacciones de créditos
CREATE TABLE IF NOT EXISTS transacciones_creditos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    cantidad INT NOT NULL,
    tipo ENUM('compra', 'uso', 'regalo', 'promocion') NOT NULL,
    descripcion VARCHAR(255),
    fecha_transaccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Índices para optimizar búsquedas
CREATE INDEX idx_canciones_nombre ON canciones(nombre);
CREATE INDEX idx_canciones_artista ON canciones(artista);
CREATE INDEX idx_usuario_numero ON usuarios(numero_telefono);

-- Procedimiento almacenado para buscar canciones
DELIMITER //
CREATE PROCEDURE buscar_canciones(IN termino_busqueda VARCHAR(255))
BEGIN
    SELECT * FROM canciones 
    WHERE nombre LIKE CONCAT('%', termino_busqueda, '%') 
    OR artista LIKE CONCAT('%', termino_busqueda, '%') 
    OR album LIKE CONCAT('%', termino_busqueda, '%');
END //
DELIMITER ;

-- Procedimiento almacenado para registrar una descarga y descontar crédito
DELIMITER //
CREATE PROCEDURE registrar_descarga(IN p_numero_telefono VARCHAR(20), IN p_id_cancion INT, OUT p_exito BOOLEAN)
BEGIN
    DECLARE v_id_usuario INT;
    DECLARE v_creditos INT;
    DECLARE v_existe_cancion BOOLEAN DEFAULT FALSE;
    
    -- Verificar si el usuario existe
    SELECT id, creditos INTO v_id_usuario, v_creditos FROM usuarios WHERE numero_telefono = p_numero_telefono LIMIT 1;
    
    -- Verificar si la canción existe
    SELECT COUNT(*) > 0 INTO v_existe_cancion FROM canciones WHERE id = p_id_cancion;
    
    -- Si el usuario existe, tiene créditos y la canción existe
    IF v_id_usuario IS NOT NULL AND v_creditos > 0 AND v_existe_cancion THEN
        -- Iniciar transacción
        START TRANSACTION;
        
        -- Descontar un crédito
        UPDATE usuarios SET creditos = creditos - 1 WHERE id = v_id_usuario;
        
        -- Registrar la descarga
        INSERT INTO descargas (id_usuario, id_cancion) VALUES (v_id_usuario, p_id_cancion);
        
        -- Registrar el uso de crédito
        INSERT INTO transacciones_creditos (id_usuario, cantidad, tipo, descripcion)
        VALUES (v_id_usuario, -1, 'uso', CONCAT('Descarga de canción ID: ', p_id_cancion));
        
        -- Confirmar la transacción
        COMMIT;
        
        SET p_exito = TRUE;
    ELSE
        SET p_exito = FALSE;
    END IF;
END //
DELIMITER ;

-- Procedimiento almacenado para añadir créditos
DELIMITER //
CREATE PROCEDURE agregar_creditos(IN p_numero_telefono VARCHAR(20), IN p_cantidad INT, IN p_tipo VARCHAR(20), IN p_descripcion VARCHAR(255), OUT p_exito BOOLEAN)
BEGIN
    DECLARE v_id_usuario INT;
    
    -- Verificar si el usuario existe
    SELECT id INTO v_id_usuario FROM usuarios WHERE numero_telefono = p_numero_telefono LIMIT 1;
    
    IF v_id_usuario IS NOT NULL THEN
        -- Iniciar transacción
        START TRANSACTION;
        
        -- Añadir créditos
        UPDATE usuarios SET creditos = creditos + p_cantidad WHERE id = v_id_usuario;
        
        -- Registrar la transacción
        INSERT INTO transacciones_creditos (id_usuario, cantidad, tipo, descripcion)
        VALUES (v_id_usuario, p_cantidad, p_tipo, p_descripcion);
        
        -- Confirmar la transacción
        COMMIT;
        
        SET p_exito = TRUE;
    ELSE
        SET p_exito = FALSE;
    END IF;
END //
DELIMITER ;
