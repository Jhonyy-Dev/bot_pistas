-- Uso de la base de datos
USE bot_chiveros_peru;

-- Insertar usuarios de ejemplo
INSERT INTO usuarios (numero_telefono, nombre, creditos, fecha_registro)
VALUES
  ('51999888777', 'Carlos Pérez', 5, NOW()),
  ('51998765432', 'María López', 3, NOW()),
  ('51987654321', 'Juan Torres', 2, NOW());

-- Insertar canciones de ejemplo
INSERT INTO canciones (nombre, artista, album, genero, duracion, ruta_archivo, tamanio_bytes, fecha_subida)
VALUES
  ('Despacito', 'Luis Fonsi ft. Daddy Yankee', 'VIDA', 'Reggaeton', '3:49', 'luis_fonsi_despacito.mp3', 4587310, NOW()),
  ('Vivir Mi Vida', 'Marc Anthony', 'Marc Anthony 3.0', 'Salsa', '4:12', 'marc_anthony_vivir_mi_vida.mp3', 5021880, NOW()),
  ('Sube La Radio', 'Enrique Iglesias', 'Enrique', 'Pop Latino', '3:30', 'enrique_iglesias_sube_la_radio.mp3', 4231050, NOW()),
  ('Mayores', 'Becky G ft. Bad Bunny', 'Mala Santa', 'Reggaeton', '3:42', 'becky_g_mayores.mp3', 4562300, NOW()),
  ('Me Rehúso', 'Danny Ocean', 'Single', 'Latin Pop', '3:23', 'danny_ocean_me_rehuso.mp3', 4103700, NOW()),
  ('Danza Kuduro', 'Don Omar ft. Lucenzo', 'Meet The Orphans', 'Latin Dance', '3:19', 'don_omar_danza_kuduro.mp3', 3985200, NOW()),
  ('Colgando en tus Manos', 'Carlos Baute ft. Marta Sánchez', 'De Mi Puño Y Letra', 'Latin Pop', '3:52', 'carlos_baute_colgando.mp3', 4678500, NOW()),
  ('Propuesta Indecente', 'Romeo Santos', 'Formula Vol. 2', 'Bachata', '5:01', 'romeo_santos_propuesta.mp3', 5874300, NOW()),
  ('Criminal', 'Natti Natasha ft. Ozuna', 'IlumiNatti', 'Reggaeton', '3:50', 'natti_natasha_criminal.mp3', 4623100, NOW()),
  ('Mi Gente', 'J Balvin ft. Willy William', 'Vibras', 'Reggaeton', '3:09', 'j_balvin_mi_gente.mp3', 3852400, NOW());

-- Registrar algunas transacciones de créditos
-- Para usuario 1
INSERT INTO transacciones_creditos (id_usuario, cantidad, tipo, descripcion, fecha_transaccion)
VALUES
  (1, 5, 'regalo', 'Créditos de bienvenida', DATE_SUB(NOW(), INTERVAL 10 DAY)),
  (1, 3, 'compra', 'Compra de créditos', DATE_SUB(NOW(), INTERVAL 5 DAY)),
  (1, -1, 'uso', 'Descarga de canción ID: 2', DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (1, -1, 'uso', 'Descarga de canción ID: 5', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (1, -1, 'uso', 'Descarga de canción ID: 8', NOW());

-- Para usuario 2
INSERT INTO transacciones_creditos (id_usuario, cantidad, tipo, descripcion, fecha_transaccion)
VALUES
  (2, 2, 'regalo', 'Créditos de bienvenida', DATE_SUB(NOW(), INTERVAL 7 DAY)),
  (2, 2, 'compra', 'Compra de créditos', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (2, -1, 'uso', 'Descarga de canción ID: 1', NOW());

-- Para usuario 3
INSERT INTO transacciones_creditos (id_usuario, cantidad, tipo, descripcion, fecha_transaccion)
VALUES
  (3, 2, 'regalo', 'Créditos de bienvenida', DATE_SUB(NOW(), INTERVAL 3 DAY));

-- Registrar descargas
INSERT INTO descargas (id_usuario, id_cancion, fecha_descarga)
VALUES
  (1, 2, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (1, 5, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (1, 8, NOW()),
  (2, 1, NOW());
