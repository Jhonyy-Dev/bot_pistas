const fs = require('fs-extra');
const path = require('path');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const { Usuario, Cancion, Descarga, TransaccionCredito } = require('../database/models');
const cancionController = require('./cancionController');
const creditoController = require('./creditoController');
const adminController = require('./adminController');
const backblazeController = require('./backblazeController');
const backblazeService = require('../services/backblazeService');
const userStateManager = require('../models/userState');

// Configuración centralizada de créditos iniciales
const CREDITOS_INICIALES = parseInt(process.env.CREDITOS_INICIALES) || 2;

// Verificar si se debe usar la base de datos
const usarDB = process.env.USAR_DB === 'true';

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
    
    // Obtener el estado actual del usuario o crear uno nuevo
    const userState = userStates.get(sender) || {};
    
    // Verificar si el usuario está esperando seleccionar una canción
    if (userState.awaitingSongSelection && /^\d+$/.test(message)) {
      const selectedIndex = parseInt(message) - 1;
      
      if (userState.songMatches && selectedIndex >= 0 && selectedIndex < userState.songMatches.length) {
        // El usuario seleccionó una canción válida de la lista
        const selectedMatch = userState.songMatches[selectedIndex];
        const selectedSong = userState.selectedSong;
        const fileName = selectedMatch.archivo_nombre || selectedMatch.file || selectedMatch.nombre;
        
        logger.info(`Usuario seleccionó la opción ${selectedIndex + 1}: ${fileName}`);
        
        try {
          // Procesar y enviar la canción seleccionada
          await processSongFile(socket, sender, fileName, selectedSong, usuario);
          
          // Limpiar el estado de selección
          userState.awaitingSongSelection = false;
          userState.songMatches = null;
          userState.step = 'inicio';
          userStates.set(sender, userState);
          return;
        } catch (error) {
          logger.error(`Error al procesar la selección de canción: ${error.message}`);
          await socket.sendMessage(sender, {
            text: `❌ Lo sentimos, ocurrió un error al procesar la canción seleccionada.\n\n` +
                  `No se han descontado créditos de tu cuenta.\n\n` +
                  `Tienes ${usuario.creditos} créditos disponibles.`
          });
          return;
        }
      } else {
        // Selección inválida
        await socket.sendMessage(sender, {
          text: `❌ Número inválido. Por favor, selecciona un número entre 1 y ${userState.songMatches.length}.`
        });
        return;
      }
    }
    
    // Si no está esperando selección, reiniciar el estado
    userState.step = 'inicio';
    userStates.set(sender, userState);
    
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
    // Limpiar el número de teléfono para quitar el @s.whatsapp.net
    const cleanPhone = phoneNumber.split('@')[0];
    
    // Si no estamos usando la base de datos, usar el módulo de estado de usuario en memoria
    if (!usarDB) {
      // Inicializar el estado del usuario si no existe
      if (!userStateManager.hasUser(cleanPhone)) {
        userStateManager.initUser(cleanPhone, {
          nombre: 'Usuario',
          creditos: CREDITOS_INICIALES,
          es_admin: false,
          es_primera_vez: true,
          fecha_registro: new Date(),
          ultimo_acceso: new Date()
        });
        logger.info(`Nuevo usuario registrado en memoria: ${cleanPhone}`);
      }
      
      // Actualizar el último acceso
      userStateManager.updateUserProperty(cleanPhone, 'ultimo_acceso', new Date());
      
      // Devolver el objeto de usuario simulado
      const userState = userStateManager.getUser(cleanPhone);
      return {
        id: cleanPhone,
        numero_telefono: cleanPhone,
        nombre: userState.nombre || 'Usuario',
        creditos: userStateManager.getCredits(cleanPhone),
        es_admin: userState.es_admin || false,
        es_primera_vez: userState.es_primera_vez || false,
        fecha_registro: userState.fecha_registro || new Date(),
        ultimo_acceso: userState.ultimo_acceso || new Date(),
        update: async (data) => {
          // Simular la función update de Sequelize
          Object.keys(data).forEach(key => {
            userStateManager.updateUserProperty(cleanPhone, key, data[key]);
          });
          return Promise.resolve();
        }
      };
    }
    
    // Si estamos usando la base de datos, comportamiento original
    const [usuario, created] = await Usuario.findOrCreate({
      where: { numero_telefono: cleanPhone },
      defaults: {
        nombre: 'Usuario',
        creditos: CREDITOS_INICIALES, // Créditos iniciales para nuevos usuarios
        es_admin: false,
        es_primera_vez: true,
        fecha_registro: new Date(),
        ultimo_acceso: new Date()
      }
    });
    
    // Si es un usuario nuevo, registrar en el log
    if (created) {
      logger.info(`Nuevo usuario registrado: ${cleanPhone}`);
      
      // Registrar la transacción de créditos iniciales
      await TransaccionCredito.create({
        id_usuario: usuario.id,
        cantidad: CREDITOS_INICIALES,
        tipo: 'inicial',
        descripcion: 'Créditos iniciales por registro',
        fecha_transaccion: new Date()
      });
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
  // Registrar el comando recibido para depuración
  logger.info(`Procesando comando: "${message}"`);
  
  // Caso especial para el comando !admin:addcredits o admin:addcredits (con o sin !)
  // Este formato: !admin:addcredits 1234567890 5 o admin:addcredits 1234567890 5
  if (message.startsWith('!admin:addcredits') || message.startsWith('admin:addcredits')) {
    // Extraer todo el mensaje y normalizarlo
    const fullCommand = message.trim();
    
    // Usar expresión regular para extraer los números directamente
    // Busca un patrón como: [comando] [número] [cantidad]
    const regex = /(?:!?admin:addcredits)\s+(\d+)\s+(\d+)/;
    const matches = fullCommand.match(regex);
    
    logger.info(`Comando addcredits detectado: "${fullCommand}", Matches: ${JSON.stringify(matches)}`);
    
    if (matches && matches.length >= 3) {
      const numero = matches[1];
      const cantidad = parseInt(matches[2]);
      
      logger.info(`Procesando comando especial: addcredits, numero: ${numero}, cantidad: ${cantidad}`);
      
      if (!isNaN(cantidad)) {
        await adminController.procesarComandoAdmin(socket, sender, '!admin:addcredits', `${numero} ${cantidad}`);
        return;
      }
    } else {
      // Si la expresión regular no funcionó, intentar con un enfoque alternativo
      // Normalizar espacios y caracteres especiales
      const normalizedCommand = fullCommand
        .replace(/\s+/g, ' ')
        .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');
      
      const parts = normalizedCommand.split(' ').filter(p => p.trim() !== '');
      logger.info(`Intento alternativo - partes: ${JSON.stringify(parts)}`);
      
      if (parts.length >= 3) {
        const numero = parts[1];
        const cantidad = parseInt(parts[2]);
        
        logger.info(`Procesando comando alternativo: ${parts[0]}, numero: ${numero}, cantidad: ${cantidad}`);
        
        if (!isNaN(cantidad)) {
          await adminController.procesarComandoAdmin(socket, sender, '!admin:addcredits', `${numero} ${cantidad}`);
          return;
        }
      }
      
      // Si llegamos aquí, no pudimos procesar el comando correctamente
      logger.error(`No se pudo procesar el comando addcredits: "${fullCommand}"`);
      await socket.sendMessage(sender, { 
        text: '⚠️ Formato incorrecto. Uso: !admin:addcredits [numero] [cantidad]\nEjemplo: !admin:addcredits 1234567890 5' 
      });
      return;
    }
  }

  
  // Procesamiento normal para otros comandos
  const parts = message.trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  
  logger.info(`Comando: "${command}", Args: "${args}"`);
  
  // Comprobar si es un comando de administrador (comienzan con !admin: o admin:)
  if (command.startsWith('!admin:')) {
    await adminController.procesarComandoAdmin(socket, sender, command, args);
    return;
  }
  
  // Permitir comandos admin sin el prefijo !
  if (command.startsWith('admin:')) {
    // Convertir admin: a !admin: para mantener compatibilidad
    const fixedCommand = '!' + command;
    await adminController.procesarComandoAdmin(socket, sender, fixedCommand, args);
    return;
  }
  
  // Comandos regulares
  switch (command) {
    case '!ayuda':
      await sendHelpMessage(socket, sender);
      break;
      
    case '!creditos':
    case '!credito':
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
    
    // Añadir instrucciones al mensaje
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
        text: '❌ No tienes créditos suficientes para descargar esta canción.\n\n*Contacta al administrador para obtener más créditos.*' 
      });
      return;
    }
    
    // Enviar mensaje de procesamiento
    await socket.sendMessage(sender, { 
      text: `⏳ *Preparando tu canción* _"${selectedSong.nombre}"..._\n*Esto puede tomar unos segundos.*` 
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
        
        // Registrar la descarga en la base de datos
        try {
          await Descarga.create({
            id_usuario: usuario.id,
            id_cancion: selectedSong.id,
            fecha_descarga: new Date(),
            origen: 'google_drive' // Registrar origen de la descarga
          });
          logger.info(`Descarga registrada para usuario ${usuario.id} - canción ${selectedSong.id} - origen: Google Drive`);
        } catch (dbError) {
          logger.error(`Error al registrar descarga en DB: ${dbError.message}`);
          // No interrumpimos el flujo por un error en el registro
        }
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
async function handleDirectSongRequest(socket, sender, searchTerm, usuario) {
  try {
    // Verificar si el usuario tiene créditos suficientes
    if (usuario.creditos <= 0) {
      await socket.sendMessage(sender, {
        text: `❌ No tienes créditos suficientes para descargar canciones.\n\n` +
              `Para obtener más créditos, contacta al administrador.`
      });
      return;
    }

    // Notificar al usuario que estamos buscando
    await socket.sendMessage(sender, {
      text: `🔍 Buscando canciones que coincidan con "${searchTerm}"...`
    });

    // Buscar canciones en Backblaze B2 y en la base de datos
    let canciones = [];
    try {
      canciones = await backblazeController.buscarCanciones(searchTerm, 320);
      logger.info(`Se encontraron ${canciones ? canciones.length : 0} canciones para "${searchTerm}"`);
    } catch (searchError) {
      logger.error(`Error en búsqueda de canciones: ${searchError.message}`);
      // Continuar con un array vacío para mostrar mensaje de no encontrado
    }

    // Verificar que canciones sea un array válido
    if (!canciones || !Array.isArray(canciones)) {
      logger.error(`Resultado de búsqueda inválido: ${typeof canciones}`);
      
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
    
    if (canciones.length === 0) {
      // No se encontraron canciones
      await socket.sendMessage(sender, {
        text: `❌ No encontré ninguna canción que coincida con "${searchTerm}".\n\n` +
              `Intenta con otro nombre o artista.`
      });
      return;
    }
    
    // Preparar mensaje con opciones
    let optionsMessage = `🎵 *RESULTADOS DE BÚSQUEDA*\n\n` +
                       `Encontré ${canciones.length} ${canciones.length === 1 ? 'canción' : 'canciones'} ` +
                       `para "${searchTerm}":\n\n`;

    // Preparar el objeto para almacenar la información de las canciones seleccionadas
    const selectedSong = {};

    // Verificar que cada canción tenga la información necesaria
    for (let i = 0; i < canciones.length; i++) {
      const match = canciones[i];
      
      // Verificar que match sea un objeto válido
      if (!match) {
        logger.error(`Canción en posición ${i} es undefined o null`);
        continue;
      }
      
      // Obtener el nombre del archivo con validación
      let fileName = '';
      if (match.archivo_nombre) {
        fileName = match.archivo_nombre;
      } else if (match.file) {
        fileName = match.file;
      } else if (match.nombre) {
        fileName = match.nombre;
      } else {
        logger.error(`Canción en posición ${i} no tiene nombre de archivo válido: ${JSON.stringify(match)}`);
        continue;
      }
      
      // Extraer nombre de la canción del nombre del archivo
      const nombreCancion = fileName.replace(/\.mp3$/i, '').replace(/_/g, ' ');
      
      // Añadir a las opciones
      optionsMessage += `${i + 1}. ${nombreCancion}\n`;
      
      // Guardar información de la canción seleccionada
      selectedSong[fileName] = {
        id: match.id || null,
        nombre: nombreCancion,
        artista: match.artista || 'Desconocido',
        archivo_nombre: fileName,
        es_backblaze: match.es_backblaze || false
      };
    }

    // Añadir instrucciones al mensaje
    optionsMessage += `📱_*Responde con el número de la canción que quieres*_.\n\n` +
    `💰 Costo por pista: 1 crédito.\n Tienes *${usuario.creditos} créditos* disponibles.`;

    // Guardar el estado del usuario
    if (!userStates.has(sender)) {
      userStates.set(sender, {});
    }
    
    const userState = userStates.get(sender);
    userState.songMatches = canciones;
    userState.selectedSong = selectedSong;
    userState.awaitingSongSelection = true;
    userState.lastActivity = Date.now();
    
    // Enviar mensaje con opciones
    await socket.sendMessage(sender, { text: optionsMessage });
  } catch (error) {
    logger.error(`Error al manejar solicitud directa de canción: ${error.message}`);
    await socket.sendMessage(sender, {
      text: `❌ Lo sentimos, ocurrió un error al procesar tu solicitud.\n\n` +
            `No se han descontado créditos de tu cuenta.\n\n` +
            `Tienes ${usuario.creditos} créditos disponibles.`
    });
  }
};

/**
 * Procesa un archivo de canción seleccionado y lo envía al usuario
 * @param {Object} socket - Socket de WhatsApp
 * @param {string} sender - ID del remitente
 * @param {string} foundFileName - Nombre del archivo encontrado
 * @param {Object} selectedSong - Información de la canción seleccionada
 * @param {Object} usuario - Información del usuario
 * @returns {Promise<boolean>} - True si se procesó correctamente
 */
async function processSongFile(socket, sender, foundFileName, selectedSong, usuario) {
  try {
    // Obtener información de la canción seleccionada
    let song;
    
    // Normalizar el nombre del archivo para búsqueda
    const normalizedFileName = foundFileName.toLowerCase();
    
    if (selectedSong && typeof selectedSong === 'object') {
      // Si ya tenemos un objeto con la información de la canción
      if (selectedSong[foundFileName]) {
        song = selectedSong[foundFileName];
      } else {
        // Buscar con diferentes claves posibles
        const keys = Object.keys(selectedSong);
        for (const key of keys) {
          const currentSong = selectedSong[key];
          const keyLower = key.toLowerCase();
          const nombreArchivo = currentSong.archivo_nombre || currentSong.nombre || "";
          
          if (keyLower === normalizedFileName || 
              nombreArchivo.toLowerCase() === normalizedFileName) {
            song = currentSong;
            break;
          }
        }
      }
    }
    
    // Si no se encontró información, crear un objeto básico
    if (!song) {
      song = { 
        nombre: foundFileName.replace(/\.mp3$/i, '').replace(/_/g, ' '),
        archivo_nombre: foundFileName
      };
      logger.info(`Creando información básica para la canción: ${foundFileName}`);
    }
    
    // Notificar al usuario que estamos descargando
    await socket.sendMessage(sender, {
      text: `⏳ Descargando "${song.nombre}" desde nuestro servidor en la nube...\nEsto puede tomar unos segundos.`
    });
    
    try {    
      // Descargar el archivo desde Backblaze B2
      logger.info(`Descargando canción desde Backblaze: ${foundFileName}`);
      const { buffer, rutaArchivo } = await backblazeController.descargarCancion(foundFileName);
      
      if (!buffer) {
        throw new Error(`No se pudo obtener el buffer para el archivo: ${foundFileName}`);
      }
      
      // Enviar la canción al usuario
      await sendSongToUser(socket, sender, buffer, foundFileName, song, usuario);
      
      // Registrar reproducción si es necesario
      try {
        await backblazeController.registrarReproduccion(song, usuario.numero_telefono);
      } catch (regError) {
        logger.warn(`No se pudo registrar la reproducción: ${regError.message}`);
        // No interrumpimos el flujo por esto
      }
      
      // Limpiar archivos temporales después de un tiempo
      if (rutaArchivo) {
        setTimeout(() => {
          try {
            if (fs.existsSync(rutaArchivo)) {
              fs.unlink(rutaArchivo, (err) => {
                if (err) {
                  logger.debug(`Error al eliminar archivo temporal: ${err.message}`);
                } else {
                  logger.debug(`Archivo temporal eliminado: ${rutaArchivo}`);
                }
              });
            }
          } catch (cleanupError) {
            logger.debug(`Error al limpiar archivo temporal: ${cleanupError.message}`);
          }
        }, 60 * 1000); // 1 minuto
      }
      
      return true;
    } catch (downloadError) {
      logger.error(`Error al descargar archivo de Backblaze B2: ${downloadError.message}`);
      await socket.sendMessage(sender, {
        text: `❌ Lo sentimos, ocurrió un error al descargar la canción desde nuestro servidor.\n\n` +
              `No se han descontado créditos de tu cuenta.\n\n` +
              `Tienes ${usuario.creditos} créditos disponibles.`
      });
      throw downloadError;
    }
  } catch (error) {
    logger.error(`Error al procesar archivo de canción: ${error.message}`);
    throw error;
  }
}

/**
 * Procesa un archivo de canción seleccionado y lo envía al usuario
 * @param {Object} socket - Socket de WhatsApp
 * @param {string} sender - ID del remitente
 * @param {string} foundFileName - Nombre del archivo encontrado
 * @param {Object} selectedSong - Información de la canción seleccionada
 * @param {Object} usuario - Información del usuario
 * @returns {Promise<void>}
 */
async function processSongFile(socket, sender, foundFileName, selectedSong, usuario) {
  try {
    // Obtener la información de la canción seleccionada
    const song = selectedSong[foundFileName];
    if (!song) {
      throw new Error(`No se encontró información para la canción: ${foundFileName}`);
    }
    
    logger.info(`Procesando canción: ${song.nombre} (${foundFileName})`);
    
    // Verificar si el usuario tiene créditos suficientes
    if (usuario.creditos <= 0) {
      await socket.sendMessage(sender, {
        text: `❌ No tienes créditos suficientes para descargar canciones.\n\n` +
              `Para obtener más créditos, contacta al administrador.`
      });
      return;
    }
    
    // Verificar si la canción es de Backblaze o local
    let buffer;
    let rutaArchivo;
    
    if (song.es_backblaze) {
      // Descargar desde Backblaze
      logger.info(`Descargando canción desde Backblaze: ${foundFileName}`);
      const result = await backblazeController.descargarCancion(foundFileName);
      buffer = result.buffer;
      rutaArchivo = result.rutaArchivo;
    } else {
      // Buscar en archivos locales
      logger.info(`Buscando canción en archivos locales: ${foundFileName}`);
      rutaArchivo = await localMp3Service.findExactSong(foundFileName);
      
      if (!rutaArchivo) {
        throw new Error(`No se encontró el archivo local: ${foundFileName}`);
      }
      
      // Leer el archivo como buffer
      buffer = await fs.readFile(rutaArchivo);
    }
    
    // Enviar la canción al usuario
    await sendSongToUser(socket, sender, buffer, foundFileName, song, usuario);
    
    return true;
  } catch (error) {
    logger.error(`Error al procesar archivo de canción: ${error.message}`);
    throw error;
  }
}

/**
 * Función auxiliar para enviar una canción al usuario
 * Versión optimizada para mayor velocidad
 */
async function sendSongToUser(socket, sender, buffer, fileName, song, usuario) {
  try {
    // Preparar el archivo para descarga con un caption más ligero
    const caption = `🎵 *${song.nombre.toUpperCase()}*\n\n*Subido por Jhonatan*`;
    
    // Cleanup manual de archivos temporales (sin usar localMp3Service)
    try {
      // Intentar limpiar archivos temporales descargados de Backblaze
      const tempDir = path.join(process.cwd(), process.env.MP3_FOLDER || 'temp');
      // Programamos la limpieza para después sin bloquear el flujo
      setTimeout(() => {
        try {
          if (fs.existsSync(tempDir)) {
            // Leer archivos y eliminar los que tienen más de 10 minutos
            fs.readdir(tempDir, (err, files) => {
              if (!err) {
                const now = Date.now();
                files.forEach(file => {
                  const filePath = path.join(tempDir, file);
                  fs.stat(filePath, (statErr, stats) => {
                    if (!statErr && (now - stats.mtimeMs) > 600000) { // 10 minutos
                      fs.unlink(filePath, () => {});
                    }
                  });
                });
              }
            });
          }
        } catch (cleanErr) {
          // Ignoramos errores en la limpieza
        }
      }, 1000);
    } catch (err) {
      // No interrumpimos el flujo por errores de limpieza
      logger.debug(`Nota: Error al limpiar archivos temporales: ${err.message}`);
    }
    
    // Enviar mensaje de preparación y archivo en paralelo
    // Esto reduce el tiempo de espera percibido por el usuario
    const preparingMessage = socket.sendMessage(sender, {
      text: `⏳ *Preparando tu canción . . .*\n*Esto puede tomar unos segundos.*`
    });
    
    // Preparar el envío del archivo inmediatamente, sin esperar al mensaje anterior
    const sendFilePromise = preparingMessage.then(() => {
      // Enviar el archivo al usuario con prioridad alta
      return socket.sendMessage(sender, {
        document: buffer,
        mimetype: 'audio/mpeg',
        fileName: fileName,
        caption: caption
      });
    }).catch(sendError => {
      logger.error(`Error al enviar archivo por WhatsApp: ${sendError.message}`);
      throw new Error(`Error al enviar el archivo por WhatsApp: ${sendError.message}`);
    });
    
    // Esperar a que se envíe el archivo
    await sendFilePromise;
    
    // Descontar el crédito DESPUÉS de enviar exitosamente
    try {
      logger.info(`Descontando crédito a usuario: ${usuario.numero_telefono}`);
      
      // Descontar crédito directamente del usuario sin depender del ID de canción
      await Usuario.decrement('creditos', { 
        where: { numero_telefono: usuario.numero_telefono },
        by: 1
      });
      
      logger.info(`Crédito descontado exitosamente`);
      
      // Si tenemos un ID de canción válido, registrar la descarga
      if (song.id) {
        try {
          await Descarga.update(
            { origen: 'local' },
            { where: { 
              id_usuario: usuario.id, 
              id_cancion: song.id,
              fecha_descarga: { [Op.gte]: new Date(new Date().setMinutes(new Date().getMinutes() - 5)) } // Descargas en los últimos 5 minutos
            }}
          );
          logger.info(`Origen de descarga registrado: local para canción ${song.id}`);
        } catch (dbError) {
          logger.error(`Error al registrar origen de descarga: ${dbError.message}`);
          // No interrumpimos el flujo por un error en el registro
        }
      } else {
        // Registrar descarga de archivo local sin ID de canción
        logger.info(`Descarga de archivo local sin ID de canción: ${fileName}`);
      }
    } catch (creditError) {
      logger.error(`Error al descontar crédito: ${creditError.message}`);
      // No interrumpimos el flujo por un error en el descuento de créditos
    }
    
    // Recarga los datos del usuario para tener los créditos actualizados
    const usuarioActualizado = await Usuario.findOne({ where: { numero_telefono: usuario.numero_telefono } });
    
    // Enviar mensaje de confirmación con créditos restantes
    await socket.sendMessage(sender, {
      text: `✅ ¡Listo! Has descargado "${song.nombre}".\n\n` +
            `*Te quedan ${usuarioActualizado.creditos} créditos disponibles.*`
    });
  } catch (error) {
    logger.error(`Error en sendSongToUser: ${error.message}`);
    throw error;
  }
}

module.exports = {
  processMessage
};
