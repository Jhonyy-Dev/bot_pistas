/**
 * Maneja la solicitud directa de una canción por nombre sin mostrar resultados
 * Esta función busca la mejor coincidencia y envía directamente el archivo MP3
 */
const handleDirectSongRequest = async (socket, sender, searchTerm, usuario) => {
  try {
    // Verificar si el usuario tiene créditos suficientes
    if (usuario.creditos <= 0) {
      await socket.sendMessage(sender, {
        text: '❌ No tienes créditos suficientes para descargar canciones.\n\n' +
              'Contacta al administrador para adquirir más créditos.'
      });
      return;
    }

    // Buscar la mejor coincidencia para la canción solicitada
    logger.info(`Buscando mejor coincidencia para: "${searchTerm}"`);
    const canciones = await cancionController.buscarCanciones(searchTerm);

    // Si no se encontraron canciones
    if (!canciones || canciones.length === 0) {
      const respuesta = respuestasSinCoincidencia[Math.floor(Math.random() * respuestasSinCoincidencia.length)];
      await socket.sendMessage(sender, { text: respuesta });
      return;
    }

    // Seleccionar la mejor coincidencia (la primera de la lista)
    const selectedSong = canciones[0];
    logger.info(`Mejor coincidencia encontrada: "${selectedSong.nombre}" por ${selectedSong.artista || 'Desconocido'}`);

    // Verificar si la canción tiene una URL externa (Google Drive)
    if (!selectedSong.url_externa || 
        selectedSong.url_externa === '' || 
        selectedSong.url_externa === 'No tiene URL externa') {
      
      logger.error(`La canción "${selectedSong.nombre}" no tiene un ID de Google Drive válido`);
      
      await socket.sendMessage(sender, {
        text: `❌ Lo sentimos, la canción "${selectedSong.nombre}" no está disponible en este momento.\n\n` +
              `No se han descontado créditos de tu cuenta.\n\n` +
              `Tienes ${usuario.creditos} créditos disponibles.`
      });
      return;
    }

    // Extraer el ID de Google Drive de la URL externa
    let googleDriveId = null;
    
    // Función mejorada para extraer ID de Google Drive
    const extractGoogleDriveId = (url) => {
      if (!url) return null;
      
      // Si ya es un ID limpio (formato: string de 33 caracteres)
      if (/^[a-zA-Z0-9_-]{25,44}$/.test(url)) {
        return url;
      }
      
      // Patrones comunes de URLs de Google Drive
      const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]{25,44})\//, // /file/d/ID/
        /id=([a-zA-Z0-9_-]{25,44})/, // ?id=ID
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{25,44})/, // drive.google.com/open?id=ID
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{25,44})/, // drive.google.com/file/d/ID
        /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]{25,44})/, // drive.google.com/uc?id=ID
        /drive\.google\.com\/uc\?export=download&id=([a-zA-Z0-9_-]{25,44})/, // drive.google.com/uc?export=download&id=ID
        /docs\.google\.com\/uc\?export=download&id=([a-zA-Z0-9_-]{25,44})/ // docs.google.com/uc?export=download&id=ID
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
      
      // Buscar cualquier cadena que parezca un ID de Google Drive
      const idMatches = url.match(/([a-zA-Z0-9_-]{25,44})/);
      if (idMatches && idMatches[1]) {
        return idMatches[1];
      }
      
      return null;
    };

    // Extraer el ID de Google Drive
    googleDriveId = extractGoogleDriveId(selectedSong.url_externa);
    
    // Si no se pudo extraer un ID válido
    if (!googleDriveId) {
      logger.error(`No se pudo extraer un ID válido de Google Drive para: ${selectedSong.nombre}`);
      logger.error(`URL externa registrada: ${selectedSong.url_externa || 'No disponible'}`);
      
      await socket.sendMessage(sender, {
        text: `❌ Lo sentimos, la canción "${selectedSong.nombre}" no está disponible en este momento.\n\n` +
              `No se han descontado créditos de tu cuenta.\n\n` +
              `Tienes ${usuario.creditos} créditos disponibles.`
      });
      return;
    }
    
    // Preparar el archivo para descarga
    let buffer;
    const artista = selectedSong.artista ? selectedSong.artista : 'Desconocido';
    // Sanitizar el nombre del archivo para evitar problemas
    const sanitizedName = selectedSong.nombre.replace(/[\/:*?"<>|]/g, '_').substring(0, 60);
    const fileName = `${artista} - ${sanitizedName}.mp3`;
    const caption = `🎵 *${selectedSong.nombre}*\n👨‍🎤 ${artista}\n\nSubido por MúsicaKit`;
    
    // Notificar al usuario que estamos preparando su canción
    await socket.sendMessage(sender, {
      text: `⏳ Preparando tu canción "${selectedSong.nombre}"...\nEsto puede tomar unos segundos.`
    });
    
    // Descargar directamente desde Google Drive usando el ID extraído
    try {
      logger.info(`Iniciando descarga desde Google Drive con ID: ${googleDriveId}`);
      const driveResult = await googleDriveService.downloadFile(googleDriveId, fileName);
      buffer = driveResult.buffer;
      
      if (!buffer || buffer.length === 0) {
        throw new Error('El archivo descargado está vacío');
      }
      
      logger.info(`Éxito! Archivo descargado desde Google Drive: ${fileName} (${buffer.length} bytes)`);
    } catch (driveError) {
      logger.error(`Error al descargar de Google Drive: ${driveError.message}`);
      
      await socket.sendMessage(sender, {
        text: `❌ Error al descargar la canción "${selectedSong.nombre}" desde Google Drive.\n\n` +
              `No se han descontado créditos de tu cuenta.\n\n` +
              `Tienes ${usuario.creditos} créditos disponibles.`
      });
      return;
    }
    
    // Enviar el archivo al usuario
    try {
      await socket.sendMessage(sender, {
        document: buffer,
        mimetype: 'audio/mpeg',
        fileName: fileName,
        caption
      });
      
      logger.info(`Archivo MP3 enviado exitosamente: ${fileName}`);
    } catch (sendError) {
      logger.error(`Error al enviar archivo por WhatsApp: ${sendError.message}`);
      
      await socket.sendMessage(sender, {
        text: `❌ Error al enviar la canción por WhatsApp.\n\n` +
              `No se han descontado créditos de tu cuenta.\n\n` +
              `Tienes ${usuario.creditos} créditos disponibles.`
      });
      return;
    }
    
    // Programar limpieza de archivos temporales
    setTimeout(() => {
      googleDriveService.cleanupTempFiles()
        .catch(err => logger.error(`Error al limpiar archivos temporales: ${err.message}`));
    }, 5 * 60 * 1000);
    
    // Descontar el crédito DESPUÉS de enviar exitosamente
    await creditoController.descontarCredito(usuario.numero_telefono, selectedSong.id);
    
    // Recarga los datos del usuario para tener los créditos actualizados
    const usuarioActualizado = await Usuario.findOne({ where: { numero_telefono: usuario.numero_telefono } });
    
    // Enviar mensaje de confirmación
    setTimeout(async () => {
      await socket.sendMessage(sender, { 
        text: `✅ ¡Listo! Se ha descontado 1 crédito de tu cuenta.\nAhora tienes ${usuarioActualizado.creditos} créditos disponibles.` 
      });
    }, 1000);
    
  } catch (error) {
    logger.error(`Error al procesar petición directa de canción: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Ocurrió un error al obtener la canción. No te preocupes, no se han descontado créditos. Por favor, intenta nuevamente.' 
    });
  }
};
