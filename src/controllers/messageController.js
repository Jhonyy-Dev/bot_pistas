const fs = require('fs-extra');
const path = require('path');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const { Usuario, Cancion, Descarga, TransaccionCredito } = require('../database/models');
const cancionController = require('./cancionController');
creditoController = require('./creditoController');
const adminController = require('./adminController');
const googleDriveService = require('../services/googleDriveService');

// Almacena el estado de conversación de los usuarios
const userStates = new Map();

// Frases de saludo aleatorias para dar variedad
const saludos = [
  '¡Hola! ¿Qué música estás buscando hoy?',
  '¡Bienvenido! ¿Qué canción te gustaría escuchar?',
  '¡Qué tal! Estoy aquí para ayudarte a encontrar tu música favorita',
  '¡Hola! Dime qué artista o canción estás buscando',
  '¡Saludos! ¿Qué melodía quieres descargar hoy?'
];

// Respuestas para cuando no se encuentra una coincidencia exacta
const respuestasSinCoincidencia = [
  'No encontré exactamente lo que buscas. ¿Podrías intentar con otro nombre o artista?',
  'Hmm, no tengo esa canción. ¿Quieres intentar con otro nombre más popular?',
  'No hay coincidencias exactas. ¿Tal vez hay un error en el título? Intenta de nuevo',
  'No encontré esa canción. ¿Quieres probar con el nombre del artista?'
];

/**
 * Procesa los mensajes entrantes y ejecuta la acción correspondiente
 */
const processMessage = async (socket, sender, message, rawMessage) => {
  try {
    // Verificar si el mensaje proviene de un grupo (termina con @g.us)
    // Los grupos tienen formato: 123456789@g.us
    // Los chats individuales tienen formato: 123456789@s.whatsapp.net
    if (sender.endsWith('@g.us')) {
      // Ignorar mensajes de grupos silenciosamente
      logger.debug(`Ignorando mensaje de grupo: ${sender}`);
      return;
    }
    
    // Guardar el mensaje original antes de manipularlo
    const mensajeOriginal = message;
    message = message.trim().toLowerCase();
    
    // Registrar o actualizar usuario
    const usuario = await getOrCreateUser(sender);
    const esPrimeraVez = usuario.es_primera_vez;
    
    // Actualizar el último acceso del usuario
    await usuario.update({ ultimo_acceso: new Date(), es_primera_vez: false });
    
    // Reiniciar estado del usuario - siempre estará en modo 'inicio' para búsqueda directa
    userStates.set(sender, { step: 'inicio' });
    
    // Registrar mensaje para depuración
    logger.info(`Mensaje recibido de ${sender}: "${mensajeOriginal}". Procesando...`);
    
    // Si es la primera interacción del usuario, enviar mensaje de bienvenida especial
    if (esPrimeraVez) {
      await sendFirstTimeWelcome(socket, sender, usuario);
      // Solo actualizamos el estado si no hay un mensaje específico para procesar
      if (message.length < 3) return;
    }
    
    // Manejo de comandos especiales (comienzan con !)
    if (message.startsWith('!')) {
      await handleCommand(socket, sender, message, usuario);
      return;
    }
    
    // Verificar primero si es una respuesta conversacional (saludos, preguntas generales, etc.)
    // Esta verificación DEBE ir antes de la verificación de petición de canción
    if (esRespuestaConversacional(message)) {
      logger.info(`Mensaje detectado como conversacional: "${mensajeOriginal}". Enviando respuesta conversacional.`);
      await sendConversationalResponse(socket, sender, usuario);
      return;
    }
    
    // FLUJO OPTIMIZADO: Detectar peticiones de canción y procesarlas directamente
    if (esPeticionCancion(message)) {
      const searchTerm = extraerTerminoCancion(message);
      logger.info(`Petición de canción detectada. Buscando y enviando directamente: "${searchTerm}"`);
      await handleDirectSongRequest(socket, sender, searchTerm, usuario);
      return;
    }
    
    // Para cualquier otro mensaje, enviar respuesta genérica
    await sendGenericMessage(socket, sender, usuario);
    
    // Registrar final del procesamiento
    logger.debug(`Procesamiento de mensaje de ${sender} completado.`);
  } catch (error) {
    logger.error(`Error en processMessage: ${error.message}`);
    await socket.sendMessage(sender, { text: '❌ Ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente.' });
  }
};

/**
 * Registra un nuevo usuario o devuelve uno existente
 */
const getOrCreateUser = async (phoneNumber) => {
  try {
    // Limpiar el número de teléfono (eliminar @s.whatsapp.net si existe)
    const cleanNumber = phoneNumber.split('@')[0];
    
    // Buscar usuario existente o crear uno nuevo
    const [usuario, created] = await Usuario.findOrCreate({
      where: { numero_telefono: cleanNumber },
      defaults: {
        creditos: 0,
        fecha_registro: new Date(),
        ultimo_acceso: new Date(),
        es_primera_vez: true
      }
    });
    
    if (created) {
      logger.info(`Nuevo usuario registrado: ${cleanNumber}`);
      
      // Dar créditos de bienvenida
      await creditoController.agregarCredito(cleanNumber, 2, 'regalo', 'Créditos de bienvenida');
    }
    
    return usuario;
  } catch (error) {
    logger.error(`Error al registrar usuario: ${error.message}`);
    throw error;
  }
};

/**
 * Maneja los comandos que comienzan con !
 */
const handleCommand = async (socket, sender, message, usuario) => {
  const command = message.split(' ')[0].toLowerCase();
  const args = message.split(' ').slice(1).join(' ');
  
  // Comprobar si es un comando de administrador (comienzan con !admin:)
  if (command.startsWith('!admin:')) {
    await adminController.procesarComandoAdmin(socket, sender, command, args);
    return;
  }
  
  // Comandos regulares
  switch (command) {
    case '!ayuda':
      await sendHelpMessage(socket, sender);
      break;
      
    case '!creditos':
      await sendCreditInfo(socket, sender, usuario);
      break;
      
    case '!buscar':
      if (args.length > 0) {
        await handleSearch(socket, sender, args, usuario);
      } else {
        await socket.sendMessage(sender, { 
          text: '⚠️ Por favor especifica qué canción deseas buscar.\nEjemplo: !buscar despacito' 
        });
      }
      break;
      
    default:
      await socket.sendMessage(sender, { 
        text: '❓ Comando desconocido. Usa !ayuda para ver los comandos disponibles.' 
      });
  }
};

/**
 * Maneja el mensaje inicial o mensajes sin contexto
 */
const handleInitialMessage = async (socket, sender, message, usuario) => {
  // Si el mensaje es muy corto, enviar mensaje conversacional
  if (message.length < 3) {
    await sendWelcomeMessage(socket, sender, usuario);
    return;
  }
  
  // Nota: La comprobación de esRespuestaConversacional ya se hizo en processMessage
  // para evitar duplicidad de lógica y garantizar que se capture correctamente
  
  // Verificar si es una solicitud específica de canción
  if (esPeticionCancion(message)) {
    // Usuario está específicamente pidiendo una canción
    const termino = extraerTerminoCancion(message);
    logger.info(`Petición de canción detectada. Buscando: "${termino}"`);
    await handleSearch(socket, sender, termino, usuario);
    return;
  }
  
  // Si no es una petición específica, responder con mensaje general
  await sendGenericMessage(socket, sender, usuario);
};

/**
 * Determina si un mensaje parece una respuesta conversacional
 * Se verifica si el mensaje completo es un saludo o si contiene frases conversacionales
 */
const esRespuestaConversacional = (message) => {
  // Si el mensaje solo es "hola" u otro saludo breve, es definitivamente conversacional
  const saludosDirectos = ['hola', 'ey', 'hey', 'ola', 'hi'];
  const mensajeLimpio = message.trim().toLowerCase();
  
  // Si el mensaje es exactamente uno de estos saludos cortos, es definitivamente conversacional
  if (saludosDirectos.includes(mensajeLimpio)) {
    return true;
  }
  
  const frasesConversacionales = [
    'hola', 'que tal', 'como estas', 'buenos dias', 'buenas tardes', 'buenas noches',
    'gracias', 'ok', 'vale', 'adios', 'chao', 'hasta luego', 'ayuda', 'info',
    'quien eres', 'que haces', 'como funciona', 'que puedes hacer', 'eres bot',
    'saludos', 'buen dia', 'bien', 'mal', 'regular', 'excelente'
  ];
  
  return frasesConversacionales.some(frase => mensajeLimpio.includes(frase));
};

/**
 * Determina si un mensaje es una petición específica de canción
 * Versión mejorada para detectar más tipos de peticiones y patrones coloquiales
 */
const esPeticionCancion = (message) => {
  // Mensaje demasiado corto probablemente no es una petición válida
  if (message.length < 3) return false;
  
  // Patrones optimizados que indican que el usuario está pidiendo una canción
  const patrones = [
    // Patrones detallados para peticiones explícitas
    /quiero la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /dame la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /busca la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /necesito la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /tienes la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /encuentra la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /envíame la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    /tendr(?:a|á)s la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+)/i,
    
    // Peticiones directas con comandos
    /^(?:dame|busca|ponme|envíame|quiero|muestra|pon|necesito) (?:.+?)$/i,
    
    // Patrones para pistas y MP3
    /(?:dame|busca|ponme|envíame|quiero) la pista (?:de |del |de la )?(.+)/i,
    /(?:dame|busca|ponme|envíame|quiero) el mp3 (?:de |del |de la )?(.+)/i,
    
    // Patrones para temas y canciones
    /^(?:canción|tema|pista|mp3) (?:de |del |de la )?(.+)/i,
    
    // Patrones coloquiales
    /^(?:pon|dale con|suena|tírame|manda) (?:.+?)$/i,
    /^(?:vamos|a ver) con (?:.+?)$/i,
    
    // Patrones para prefijos comunes
    /^la (?:canción|pista|música) (?:de |del |de la )?(.+)/i,
    
    // Patrón para capturar solicitudes directas con nombres de canciones conocidas
    // Esto asume que mensajes con longitud moderada sin prefijos pueden ser nombres
    // de canciones directamente. Tiene riesgo de falsos positivos pero mejora la UX.
    /^[A-Za-z0-9 áéíóúÁÉÍÓÚñÑ&,.\-]{4,60}$/i
  ];
  
  // Verificar si el mensaje coincide con alguno de los patrones
  const esCancion = patrones.some(patron => message.match(patron));
  
  // Excluir mensajes conversacionales comunes y comandos para evitar falsos positivos
  const exclusiones = [
    /^(hola|saludos|hey|que tal|cuál|como|qué|gracias|ok|buenos días|buenas|adios|hasta|ayuda)\b/i,
    /^(!|\?)/ // Comandos o preguntas
  ];
  
  const esExcluido = exclusiones.some(exclusion => message.match(exclusion));
  
  return esCancion && !esExcluido;
};

/**
 * Extrae el término de búsqueda de la petición de canción de manera optimizada
 * Versión mejorada para detectar mejor los nombres de canciones
 */
const extraerTerminoCancion = (message) => {
  // Patrones optimizados para extraer exactamente el nombre de la canción
  const patrones = [
    // Patrones detallados para peticiones explícitas
    /quiero la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /dame la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /busca la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /necesito la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /tienes la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /encuentra la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /tendr(?:a|á)s la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,
    /envíame la canc(?:i|ió)n (?:de |del |de la |del grupo )?(.+?)$/i,

    // Patrones para comandos más simples
    /^(?:dame|busca|ponme|envía|quiero|necesito) (.+?)$/i,

    // Patrones para peticiones con 'pista'
    /(?:dame|busca|ponme|quiero|necesito) la pista (?:de |del |de la |del grupo )?(.+?)$/i,

    // Patrones para nombres directos con prefijos comunes
    /^la canc(?:i|ió)n (?:de |del |de la )?(.+?)$/i,
    /^canc(?:i|ió)n (?:de |del |de la )?(.+?)$/i,
    /^pista (?:de |del |de la )?(.+?)$/i,

    // Patrones finales generales (usar con precaución, podrían ser muy inclusivos)
    /^(.+?)$/i, // Último recurso: tomar el mensaje completo como nombre de canción
  ];

  // Variables para depuración
  let patronCoincidente = null;
  let coincidenciaFinal = null;

  // Buscar en cada patrón y extraer el término
  for (const patron of patrones) {
    const match = message.match(patron);
    if (match && match[1]) {
      // Guardar patrón y coincidencia para depuración
      patronCoincidente = patron.toString();
      coincidenciaFinal = match[1].trim();

      // Limpiar el término de búsqueda de palabras vacías o innecesarias al final
      const terminoLimpio = coincidenciaFinal
        .replace(/\s+(por favor|gracias|xfa|porfis|porfa)\s*$/i, '')
        .replace(/\s+(?:mp3|audio|pista|instrumental)\s*$/i, '')
        .trim();

      logger.debug(`Término extraído: "${terminoLimpio}" usando patrón: ${patronCoincidente}`);

      return terminoLimpio || coincidenciaFinal; // Devolver término limpio o el original si la limpieza lo dejó vacío
    }
  }

  // Si llegamos aquí, ningún patrón coincidió completamente
  // Último recurso: eliminar frases comunes de petición
  const mensajeLimpio = message
    .replace(/^(?:dame|busca|ponme|quiero|necesito|tienes|encuentra|envíame)\s+(?:la\s+)?(?:canción|pista|tema|mp3)\s+(?:de\s+)?/i, '')
    .replace(/\s+(por favor|gracias|xfa|porfis|porfa)\s*$/i, '')
    .trim();

  logger.debug(`Extracción sin patrón específico: "${mensajeLimpio}"`);

  return mensajeLimpio || message;
}

/**
 * Envía una respuesta conversacional natural
 */
const sendConversationalResponse = async (socket, sender, usuario) => {
  const randomIndex = Math.floor(Math.random() * saludos.length);
  const saludo = saludos[randomIndex];
  
  const message = `${saludo}\n\n` +
    `Recuerda que tienes *${usuario.creditos} créditos* disponibles.\n\n` +
    `*¿Cómo pedir una canción?*\n` +
    `• "Dame la canción de Despacito"\n` +
    `• "Quiero la canción Gasolina"\n` +
    `• "Tienes la canción de Bad Bunny"\n\n` +
    `También puedes usar *!ayuda* para ver todos los comandos disponibles.`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Envía un mensaje genérico cuando no se detecta una petición clara
 */
const sendGenericMessage = async (socket, sender, usuario) => {
  const message = `¡Gracias por tu mensaje! Si estás buscando música, puedes pedirme una canción de la siguiente manera:\n\n` +
    `• "Dame la canción de [nombre]"\n` +
    `• "Quiero la canción [nombre]"\n` +
    `• "Busca la canción [nombre]"\n\n` +
    `Actualmente tienes *${usuario.creditos} créditos* disponibles.\n\n` +
    `Si necesitas ayuda con otros comandos, escribe *!ayuda*.`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Envía un mensaje de bienvenida cuando el usuario envía un mensaje corto
 */
const sendWelcomeMessage = async (socket, sender, usuario) => {
  const randomIndex = Math.floor(Math.random() * saludos.length);
  const saludo = saludos[randomIndex];
  
  const message = `${saludo}\n\n` +
    `Actualmente tienes *${usuario.creditos} créditos* disponibles para descargar música.\n\n` +
    `Para buscar una canción, simplemente escribe el nombre o el artista.\n` +
    `También puedes usar *!ayuda* si necesitas ver todos los comandos disponibles.`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Envía un mensaje especial de primera bienvenida a nuevos usuarios
 */
const sendFirstTimeWelcome = async (socket, sender, usuario) => {
  const message = `🎵 *¡Bienvenido a Bot Chiveros Perú!* 🎵\n\n` +
    `¡Hola ${usuario.nombre || 'amigo'}! 👋 Gracias por contactarnos.\n\n` +
    `Soy tu asistente musical y estoy aquí para ayudarte a encontrar y descargar tus canciones favoritas.\n\n` +
    `✨ *Te hemos regalado ${usuario.creditos} créditos* para que comiences a disfrutar de la música.\n\n` +
    `*¿Qué puedes hacer?*\n` +
    `• Buscar música: Solo escribe el nombre de una canción o artista\n` +
    `• Ver tus créditos: Escribe !creditos\n` +
    `• Ver todos los comandos: Escribe !ayuda\n\n` +
    `¿Qué canción te gustaría buscar hoy? 🎧`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Envía información de ayuda
 */
const sendHelpMessage = async (socket, sender) => {
  const message = `🎵 *Ayuda de Bot Chiveros Perú* 🎵\n\n` +
    `*Comandos disponibles:*\n` +
    `!ayuda - Muestra este mensaje de ayuda\n` +
    `!creditos - Consulta tus créditos disponibles\n` +
    `!buscar [canción] - Busca una canción específica\n\n` +
    `*Cómo funciona:*\n` +
    `1. Escribe el nombre de una canción o artista\n` +
    `2. Selecciona una canción de los resultados enviando su número\n` +
    `3. Si tienes créditos suficientes (1 por canción), se te enviará el archivo MP3\n\n` +
    `Para cualquier duda o problema, contacta al administrador.`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Envía información de créditos
 */
const sendCreditInfo = async (socket, sender, usuario) => {
  const message = `💳 *Información de Créditos* 💳\n\n` +
    `Actualmente tienes *${usuario.creditos} créditos* disponibles.\n\n` +
    `Cada descarga de canción cuesta 1 crédito.\n` +
    `Para obtener más créditos, contacta al administrador.`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Maneja la búsqueda de canciones
 */
const handleSearch = async (socket, sender, searchTerm, usuario) => {
  try {
    // Buscar canciones que coincidan
    let canciones = await cancionController.buscarCanciones(searchTerm);
    
    // Asegurar que canciones sea un array manipulable
    // Esto soluciona el error "canciones.slice is not a function"
    if (!Array.isArray(canciones)) {
      logger.debug(`Resultado de búsqueda no es array, convirtiendo: ${typeof canciones}`);
      
      // Si es un resultado directo de procedimiento almacenado
      if (canciones && typeof canciones === 'object') {
        // Si tiene una propiedad que contiene el array real (resultado de procedimiento almacenado)
        if (canciones[0] && Array.isArray(canciones[0])) {
          canciones = canciones[0];
        } else {
          // Si es un objeto único o no reconocible, convertir a array
          canciones = [].concat(canciones).filter(Boolean);
        }
      } else {
        // Si no es un objeto reconocible, inicializar como array vacío
        canciones = [];
      }
    }
    
    if (!canciones.length) {
      // Seleccionar una respuesta aleatoria para dar variedad
      const randomIndex = Math.floor(Math.random() * respuestasSinCoincidencia.length);
      const respuesta = respuestasSinCoincidencia[randomIndex];
      
      await socket.sendMessage(sender, { 
        text: `❌ ${respuesta}\n\nBuscaste: "${searchTerm}"` 
      });
      
      // Sugerir otro enfoque después de un breve retraso
      setTimeout(async () => {
        await socket.sendMessage(sender, {
          text: "💡 *Consejos para buscar:*\n" +
                "• Intenta usar solo el título principal de la canción\n" +
                "• Prueba buscando por el nombre del artista\n" +
                "• Verifica que no haya errores ortográficos"
        });
      }, 1000);
      
      return;
    }
    
    // Mostrar hasta 30 resultados (antes era solo 10)
    // Para artistas como Josimar y su Yambu que tienen muchas canciones
    const resultadosMostrados = canciones.length > 30 ? canciones.slice(0, 30) : canciones;
    
    logger.debug(`Mostrando ${resultadosMostrados.length} de ${canciones.length} canciones encontradas`);
    
    // Formato ajustado para garantizar que WhatsApp lo muestre correctamente
    const songResults = [];
    
    // Crear lista de canciones con formato adecuado - nuevo formato "Presiona X. TÍTULO"
    for (let i = 0; i < resultadosMostrados.length; i++) {
      const titulo = resultadosMostrados[i].nombre || 'Canción sin título';
      // Mostrar el número que debe presionar el usuario y el título en mayúsculas
      songResults.push(`Presiona ${i + 1}. ${titulo.toUpperCase()}`);
    }
    
    // Construir el mensaje completo con el formato exacto requerido
    const resultMessage = [
      `🔍 *Resultados de búsqueda para "${searchTerm}"*`,
      "",
      songResults.join("\n\n"),
      "",
      `Tienes *${usuario.creditos} créditos* disponibles.`,
      `**PARA DESCARGAR UNA CANCIÓN, ENVÍA EL NÚMERO CORRESPONDIENTE.**`
    ].join("\n");
    
    await socket.sendMessage(sender, { text: resultMessage });
    
    // Guardar resultados en el estado del usuario
    userStates.set(sender, {
      step: 'seleccion',
      results: resultadosMostrados,
      searchTerm
    });
    
    logger.info(`Búsqueda exitosa para "${searchTerm}": ${resultadosMostrados.length} resultados mostrados de ${canciones.length} encontrados`);
    
  } catch (error) {
    logger.error(`Error en búsqueda: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Ocurrió un error al buscar canciones. Por favor, intenta nuevamente.' 
    });
  }
};

/**
 * Maneja la selección de una canción de los resultados
 */
const handleSongSelection = async (socket, sender, message, usuario, userState) => {
  try {
    // Verificar si el mensaje es un número válido
    const selection = parseInt(message);
    
    if (isNaN(selection) || selection < 1 || selection > userState.results.length) {
      await socket.sendMessage(sender, { 
        text: `❌ Por favor, ingresa un número válido entre 1 y ${userState.results.length}.` 
      });
      return;
    }
    
    // Obtener la canción seleccionada
    const selectedSong = userState.results[selection - 1];
    
    // Verificar si el usuario tiene créditos suficientes
    if (usuario.creditos < 1) {
      await socket.sendMessage(sender, { 
        text: '❌ No tienes créditos suficientes para descargar esta canción. Contacta al administrador para obtener más créditos.' 
      });
      return;
    }
    
    // Enviar mensaje de procesamiento
    await socket.sendMessage(sender, { 
      text: `⏳ Preparando tu canción "${selectedSong.nombre}"...\nEsto puede tomar unos segundos.` 
    });
    
    // Preparar datos para el envío del archivo
    const caption = `🎵 *${selectedSong.nombre}*\n👤 ${selectedSong.artista || 'Desconocido'}\n💿 ${selectedSong.album || 'Desconocido'}`;
    const fileName = `${selectedSong.artista || 'Unknown'} - ${selectedSong.nombre}.mp3`;
    
    // Depurar información sobre la canción seleccionada
    logger.info(`Información de la canción seleccionada:`);
    logger.info(JSON.stringify({
      id: selectedSong.id,
      nombre: selectedSong.nombre,
      artista: selectedSong.artista,
      url_externa: selectedSong.url_externa || 'No tiene URL externa',
      ruta_archivo: selectedSong.ruta_archivo || 'No tiene ruta de archivo'
    }));
    
    try {
      // Variable para rastrear si tuvimos éxito al obtener el archivo
      let buffer;
      
      // Verificar que la canción tenga URL de Google Drive válida
      if (!selectedSong.url_externa || selectedSong.url_externa === "No tiene URL externa" || selectedSong.url_externa.trim() === "") {
        // Informar claramente que esta canción no está disponible en Google Drive
        await socket.sendMessage(sender, {
          text: `❌ Lo sentimos, la canción "${selectedSong.nombre}" de ${selectedSong.artista || 'Artista desconocido'} aún no está disponible en nuestro servidor.\n\nSe están migrando todas las canciones a Google Drive. Intenta con otra opción de la lista.\n\nNo se han descontado créditos de tu cuenta.`
        });
        
        // Resetear el estado del usuario para que pueda seguir buscando
        userStates.set(sender, { step: 'inicio' });
        return; // Detener la ejecución aquí para evitar el mensaje de error genérico
      }
      
      logger.info(`Descargando exclusivamente desde Google Drive: ${selectedSong.nombre}, ID: ${selectedSong.url_externa}`);
      
      // Realizar la descarga desde Google Drive
      try {
        const driveResult = await googleDriveService.downloadFile(selectedSong.url_externa, fileName);
        buffer = driveResult.buffer;
        
        if (!buffer || buffer.length === 0) {
          throw new Error('El archivo descargado está vacío');
        }
        
        logger.info(`Éxito! Archivo descargado desde Google Drive: ${fileName} (${buffer.length} bytes)`);
      } catch (driveError) {
        logger.error(`Error al descargar de Google Drive: ${driveError.message}`);
        throw new Error(`Error al obtener la canción de Google Drive: ${driveError.message}`);
      }
      
      // Enviar el archivo al usuario (ya sabemos que tenemos buffer válido)
      logger.info(`Enviando archivo MP3 al usuario: ${fileName} (${buffer.length} bytes)`);
      
      // Enviar como documento para permitir descarga
      await socket.sendMessage(sender, {
        document: buffer,
        mimetype: 'audio/mpeg',
        fileName: fileName,
        caption
      });
      
      // Programar limpieza de archivos temporales
      setTimeout(() => {
        googleDriveService.cleanupTempFiles()
          .catch(err => logger.error(`Error al limpiar archivos temporales: ${err.message}`));
      }, 5 * 60 * 1000); // Limpiar después de 5 minutos
      
      // AHORA es el momento de descontar el crédito, DESPUÉS de enviar el archivo con éxito
      await creditoController.descontarCredito(usuario.numero_telefono, selectedSong.id);
      
      // Recarga los datos del usuario para tener los créditos actualizados
      const usuarioActualizado = await usuarioController.obtenerUsuarioPorTelefono(usuario.numero_telefono);
      
      // Enviar mensaje de confirmación
      setTimeout(async () => {
        await socket.sendMessage(sender, { 
          text: `✅ ¡Listo! Se ha descontado 1 crédito de tu cuenta.\nAhora tienes ${usuarioActualizado.creditos} créditos disponibles.` 
        });
        
        // Restablecer el estado del usuario
        userStates.set(sender, { step: 'inicio' });
      }, 1000);
      
    } catch (downloadError) {
      // NO descontar crédito en caso de error (ya no necesitamos agregar crédito porque no lo descontamos antes)
      logger.error(`Error al descargar/enviar archivo: ${downloadError.message}`);
      
      // Enviar mensaje específico según el tipo de error
      let errorMessage = '❌ Ocurrió un error al descargar el archivo. No te preocupes, no se han descontado créditos.';
      
      if (downloadError.message.includes('Archivo no disponible')) {
        const songName = downloadError.message.includes('-') ? 
          downloadError.message.split('-')[1]?.trim() : 
          selectedSong.nombre;
          
        errorMessage = `❌ Lo sentimos, la canción "${songName}" no está disponible en este momento.\n\nNo se han descontado créditos de tu cuenta.\n\nTienes ${usuario.creditos} créditos disponibles.`;
      } else if (downloadError.message.includes('Drive')) {
        errorMessage = '❌ Error al conectar con nuestro servidor de archivos. No te preocupes, no se han descontado créditos. Por favor intenta más tarde.';
      }
      
      await socket.sendMessage(sender, { 
        text: errorMessage
      });
      
      // Restablecer el estado del usuario para que pueda seguir buscando
      userStates.set(sender, { step: 'inicio' });
    }
    
  } catch (error) {
    logger.error(`Error en selección de canción: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente.' 
    });
  }
};

/**
 * Maneja la solicitud directa de una canción por nombre sin mostrar resultados
 * Esta función busca la mejor coincidencia y envía directamente el archivo MP3
 */
const handleDirectSongRequest = async (socket, sender, searchTerm, usuario) => {
  try {
    // Verificar si el usuario tiene créditos disponibles
    if (usuario.creditos <= 0) {
      await socket.sendMessage(sender, {
        text: '❌ No tienes créditos disponibles para descargar canciones.\n\n' +
              'Para obtener más créditos, contacta al administrador.'
      });
      return;
    }
    
    // Buscar la canción por nombre
    const canciones = await cancionController.buscarCanciones(searchTerm);
    
    // Si no hay resultados
    if (!canciones || !canciones.length) {
      // Seleccionar una respuesta aleatoria para dar variedad
      const randomIndex = Math.floor(Math.random() * respuestasSinCoincidencia.length);
      const respuesta = respuestasSinCoincidencia[randomIndex];
      
      await socket.sendMessage(sender, { 
        text: `❌ ${respuesta}\n\nBuscaste: "${searchTerm}"` 
      });
      return;
    }
    
    // Tomar el primer resultado (la coincidencia más exacta)
    const selectedSong = canciones[0];
    
    logger.info(`Información de la canción seleccionada:`);
    logger.info(JSON.stringify(selectedSong));
    
    // Extraer el ID de Google Drive de la URL o usar el campo url_externa directamente
    // Esta es la parte crítica que necesitamos mejorar
    let googleDriveId = null;
    
    // Verificar diferentes escenarios de almacenamiento de IDs
    if (selectedSong.url_externa && selectedSong.url_externa !== 'No tiene URL externa') {
      // Caso 1: La url_externa ya es un ID de Google Drive directo
      if (/^[a-zA-Z0-9_-]{25,44}$/.test(selectedSong.url_externa.trim())) {
        googleDriveId = selectedSong.url_externa.trim();
        logger.info(`ID de Google Drive encontrado directamente: ${googleDriveId}`);
      } 
      // Caso 2: La URL es una URL completa de Google Drive con ID en ella
      else if (selectedSong.url_externa.includes('drive.google.com')) {
        const urlObj = new URL(selectedSong.url_externa);
        // URL formato 1: https://drive.google.com/file/d/ID_AQUI/view
        if (selectedSong.url_externa.includes('/file/d/')) {
          const matches = selectedSong.url_externa.match(/\/file\/d\/([a-zA-Z0-9_-]{25,44})\//);
          if (matches && matches[1]) {
            googleDriveId = matches[1];
            logger.info(`ID de Google Drive extraído de URL completa: ${googleDriveId}`);
          }
        } 
        // URL formato 2: https://drive.google.com/open?id=ID_AQUI
        else if (urlObj.searchParams.has('id')) {
          googleDriveId = urlObj.searchParams.get('id');
          logger.info(`ID de Google Drive extraído de parámetro URL: ${googleDriveId}`);
        }
      }
      // Caso 3: Es una URL cortada o un formato diferente, buscar un patrón de ID
      else {
        const idMatches = selectedSong.url_externa.match(/([a-zA-Z0-9_-]{25,44})/);
        if (idMatches && idMatches[1]) {
          googleDriveId = idMatches[1];
          logger.info(`ID de Google Drive extraído por patrón: ${googleDriveId}`);
        }
      }
    }
    
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
      throw new Error(`Error al obtener la canción de Google Drive: ${driveError.message}`);
    }
    
    // Enviar el archivo al usuario
    await socket.sendMessage(sender, {
      document: buffer,
      mimetype: 'audio/mpeg',
      fileName: fileName,
      caption
    }).catch(sendError => {
      logger.error(`Error al enviar archivo por WhatsApp: ${sendError.message}`);
      throw new Error(`Error al enviar el archivo por WhatsApp: ${sendError.message}`);
    });
    
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

module.exports = {
  processMessage
};
