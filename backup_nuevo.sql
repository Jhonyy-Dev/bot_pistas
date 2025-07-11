-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: srv1847.hstgr.io    Database: u487652187_bot_pistas
-- ------------------------------------------------------
-- Server version	5.5.5-10.11.10-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `busquedas_fallidas`
--

DROP TABLE IF EXISTS `busquedas_fallidas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `busquedas_fallidas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `termino_busqueda` varchar(500) NOT NULL,
  `usuario_whatsapp` varchar(20) NOT NULL,
  `fecha_busqueda` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_termino` (`termino_busqueda`(255)),
  KEY `idx_fecha` (`fecha_busqueda`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `busquedas_fallidas`
--

LOCK TABLES `busquedas_fallidas` WRITE;
/*!40000 ALTER TABLE `busquedas_fallidas` DISABLE KEYS */;
/*!40000 ALTER TABLE `busquedas_fallidas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache_busquedas`
--

DROP TABLE IF EXISTS `cache_busquedas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_busquedas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `termino_busqueda` varchar(255) NOT NULL,
  `resultados` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Resultados serializados en formato JSON' CHECK (json_valid(`resultados`)),
  `hits` int(11) DEFAULT 1 COMMENT 'N├║mero de veces que se ha usado este cach├®',
  `fecha_creacion` timestamp NULL DEFAULT current_timestamp(),
  `fecha_ultimo_uso` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expiracion` timestamp NULL DEFAULT (current_timestamp() + interval 24 hour) COMMENT 'Cu├índo expira este cach├®',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_termino_unico` (`termino_busqueda`),
  KEY `idx_hits` (`hits`),
  KEY `idx_expiracion` (`expiracion`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache_busquedas`
--

LOCK TABLES `cache_busquedas` WRITE;
/*!40000 ALTER TABLE `cache_busquedas` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_busquedas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `canciones`
--

DROP TABLE IF EXISTS `canciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `canciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL COMMENT 'Nombre de la canci├│n',
  `artista` varchar(255) DEFAULT NULL COMMENT 'Nombre del artista',
  `album` varchar(255) DEFAULT NULL COMMENT 'Nombre del ├ílbum',
  `genero` varchar(100) DEFAULT NULL COMMENT 'G├®nero musical',
  `duracion` varchar(10) DEFAULT NULL COMMENT 'Duraci├│n en formato MM:SS',
  `ruta_archivo` varchar(500) NOT NULL COMMENT 'Ruta completa del archivo en B2 o ID de Google Drive',
  `tamanio_bytes` int(11) DEFAULT NULL COMMENT 'Tama├▒o en bytes',
  `fecha_subida` timestamp NULL DEFAULT current_timestamp(),
  `url_externa` varchar(500) DEFAULT NULL COMMENT 'URL externa o ID de Google Drive',
  `popularidad` int(11) DEFAULT 0 COMMENT 'Contador de popularidad para ordenar resultados',
  `hash_contenido` varchar(64) DEFAULT NULL COMMENT 'Hash SHA-256 para verificar integridad',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ruta_archivo` (`ruta_archivo`(255)) COMMENT '├ìndice ├║nico para evitar duplicados (limitado a 255 chars)',
  KEY `idx_nombre_artista` (`nombre`(50),`artista`(50)) COMMENT '├ìndice compuesto para b├║squedas por nombre y artista',
  KEY `idx_artista_nombre` (`artista`(50),`nombre`(50)) COMMENT '├ìndice compuesto para b├║squedas por artista y nombre',
  KEY `idx_genero_popularidad` (`genero`,`popularidad`) COMMENT '├ìndice para b├║squedas por g├®nero ordenadas por popularidad',
  FULLTEXT KEY `idx_busqueda` (`nombre`,`artista`,`album`) COMMENT '├ìndice de texto completo con parser natural'
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `canciones`
--

LOCK TABLES `canciones` WRITE;
/*!40000 ALTER TABLE `canciones` DISABLE KEYS */;
INSERT INTO `canciones` VALUES (1,'Mil Pedazos / No Se Puede Morir de Amor / Miento / Donde Estas Amor','Centella','Mix Rom├íntico','Salsa Rom├íntica',NULL,'centella - mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',27195392,'2025-06-11 01:26:33',NULL,0,NULL),(2,' mil pedazos','1749606160371_centella','Desconocido',NULL,NULL,'1749606160371_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 01:46:27',NULL,0,NULL),(3,' mil pedazos','1749606204505_centella','Desconocido',NULL,NULL,'1749606204505_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 01:46:27',NULL,0,NULL),(4,' mil pedazos','1749606398109_centella','Desconocido',NULL,NULL,'1749606398109_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 01:47:02',NULL,0,NULL),(5,' mil pedazos','1749606428254_centella','Desconocido',NULL,NULL,'1749606428254_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 01:53:07',NULL,0,NULL),(6,' mil pedazos','1749606942982_centella','Desconocido',NULL,NULL,'1749606942982_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 01:56:29',NULL,0,NULL),(7,' mil pedazos','1749606997043_centella','Desconocido',NULL,NULL,'1749606997043_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 01:58:05',NULL,0,NULL),(8,' mil pedazos','1749607091417_centella','Desconocido',NULL,NULL,'1749607091417_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:01:48',NULL,0,NULL),(9,' mil pedazos','1749607314372_centella','Desconocido',NULL,NULL,'1749607314372_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:03:50',NULL,0,NULL),(10,' mil pedazos','1749607315075_centella','Desconocido',NULL,NULL,'1749607315075_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:03:50',NULL,0,NULL),(11,' mil pedazos','1749607435887_centella','Desconocido',NULL,NULL,'1749607435887_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:11:20',NULL,0,NULL),(12,' mil pedazos','1749607436816_centella','Desconocido',NULL,NULL,'1749607436816_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:11:20',NULL,0,NULL),(13,' mil pedazos','1749609196080_centella','Desconocido',NULL,NULL,'1749609196080_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:38:06',NULL,0,NULL),(14,' mil pedazos','1749609196894_centella','Desconocido',NULL,NULL,'1749609196894_centella -  mil pedazos - nose puede morir de amor - miento - donde estas amor.mp3',25860180,'2025-06-11 02:38:06',NULL,0,NULL),(15,'1749612367260_- 5 PARA LAS 12 vivo','Desconocido','Desconocido',NULL,NULL,'1749612367260_- 5 PARA LAS 12 vivo.mp3',10221610,'2025-06-13 23:40:38',NULL,0,NULL),(16,'1749612368002_- 5 PARA LAS 12 vivo','Desconocido','Desconocido',NULL,NULL,'1749612368002_- 5 PARA LAS 12 vivo.mp3',10221610,'2025-06-13 23:40:38',NULL,0,NULL);
/*!40000 ALTER TABLE `canciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `configuracion`
--

DROP TABLE IF EXISTS `configuracion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion` (
  `clave` varchar(50) NOT NULL,
  `valor` text NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `fecha_actualizacion` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuracion`
--

LOCK TABLES `configuracion` WRITE;
/*!40000 ALTER TABLE `configuracion` DISABLE KEYS */;
INSERT INTO `configuracion` VALUES ('b2_bucket_name','pistas','Nombre del bucket en Backblaze B2','2025-06-11 01:26:33'),('b2_endpoint','https://s3.us-west-005.backblazeb2.com','Endpoint de Backblaze B2','2025-06-11 01:26:33'),('mantenimiento_20250611','{\"cache_limpiados\":0, \"timestamp\":\"2025-06-11 03:57:02\"}','Registro de mantenimiento autom├ítico','2025-06-11 03:57:02'),('mantenimiento_20250613','{\"cache_limpiados\":1, \"timestamp\":\"2025-06-13 23:40:36\"}','Registro de mantenimiento autom├ítico','2025-06-13 23:40:36'),('max_conexiones_concurrentes','200','N├║mero m├íximo de conexiones concurrentes permitidas','2025-06-11 01:26:33'),('max_resultados_busqueda','5','N├║mero m├íximo de resultados por b├║squeda','2025-06-11 01:26:33'),('mensaje_bienvenida','┬íBienvenido al Bot de Pistas! Env├¡a el nombre de una canci├│n para buscarla.','Mensaje de bienvenida para nuevos usuarios','2025-06-11 01:26:33'),('mensaje_no_encontrado','Lo siento, no encontr├® esa canci├│n. Intenta con otro nombre.','Mensaje cuando no se encuentra una canci├│n','2025-06-11 01:26:33'),('tiempo_cache_busquedas','24','Tiempo en horas que se mantienen las b├║squedas en cach├®','2025-06-11 01:26:33'),('version_app','1.0.0','Versi├│n actual de la aplicaci├│n','2025-06-11 01:26:33');
/*!40000 ALTER TABLE `configuracion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `descargas`
--

DROP TABLE IF EXISTS `descargas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `descargas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `id_cancion` int(11) NOT NULL,
  `fecha_descarga` timestamp NULL DEFAULT current_timestamp(),
  `origen` varchar(50) DEFAULT 'local' COMMENT 'Origen de la descarga: local, google_drive, etc.',
  PRIMARY KEY (`id`),
  KEY `idx_usuario` (`id_usuario`),
  KEY `idx_cancion` (`id_cancion`),
  KEY `idx_fecha` (`fecha_descarga`),
  CONSTRAINT `descargas_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `descargas_ibfk_2` FOREIGN KEY (`id_cancion`) REFERENCES `canciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `descargas`
--

LOCK TABLES `descargas` WRITE;
/*!40000 ALTER TABLE `descargas` DISABLE KEYS */;
/*!40000 ALTER TABLE `descargas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transacciones_creditos`
--

DROP TABLE IF EXISTS `transacciones_creditos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transacciones_creditos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `cantidad` int(11) NOT NULL COMMENT 'Cantidad de cr├®ditos (positivo: ingreso, negativo: gasto)',
  `tipo` enum('compra','uso','regalo','promocion','inicial') NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `fecha_transaccion` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_usuario` (`id_usuario`),
  KEY `idx_fecha` (`fecha_transaccion`),
  KEY `idx_tipo` (`tipo`),
  CONSTRAINT `transacciones_creditos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transacciones_creditos`
--

LOCK TABLES `transacciones_creditos` WRITE;
/*!40000 ALTER TABLE `transacciones_creditos` DISABLE KEYS */;
INSERT INTO `transacciones_creditos` VALUES (1,2,10,'inicial','Cr├®ditos iniciales por registro','2025-06-11 01:30:07'),(2,2,1,'regalo','Cr├®ditos agregados por administrador','2025-06-11 02:24:05');
/*!40000 ALTER TABLE `transacciones_creditos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero_telefono` varchar(20) NOT NULL COMMENT 'N├║mero de tel├®fono con formato internacional',
  `nombre` varchar(100) DEFAULT NULL COMMENT 'Nombre del usuario (opcional)',
  `creditos` int(11) DEFAULT 10 COMMENT 'Cr├®ditos disponibles para descargas',
  `es_admin` tinyint(1) DEFAULT 0 COMMENT 'Indica si el usuario es administrador',
  `es_primera_vez` tinyint(1) DEFAULT 1 COMMENT 'Indica si es la primera vez que el usuario usa el bot',
  `fecha_registro` timestamp NULL DEFAULT current_timestamp(),
  `ultimo_acceso` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_telefono` (`numero_telefono`),
  KEY `idx_numero_telefono` (`numero_telefono`),
  KEY `idx_es_admin` (`es_admin`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,'admin','Administrador',999,1,0,'2025-06-11 01:26:33','2025-06-11 01:26:33'),(2,'19296298178','Usuario',2,0,0,'2025-06-11 01:30:07','2025-06-11 04:20:49');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-13 20:07:19
