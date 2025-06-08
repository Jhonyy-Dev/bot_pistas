const { Op } = require('sequelize');
const logger = require('../config/logger');
const { Usuario, Cancion, Descarga, TransaccionCredito, sequelize } = require('../database/models');
const creditoController = require('./creditoController');
const { importarTodos } = require('../utils/importarMp3');
const mensajeriaService = require('../services/mensajeriaService');

// Lista de números de administradores (solo estos pueden ejecutar comandos admin)
const ADMIN_NUMBERS = ['19296298178', 'ADMIN_NUMBER_2']; // Reemplazar con números reales sin el @s.whatsapp.net

/**
 * Verifica si un número es administrador
 */
const esAdministrador = (numeroTelefono) => {
  const numero = numeroTelefono.split('@')[0];
  return ADMIN_NUMBERS.includes(numero);
};

/**
 * Procesa comandos de administrador
 */
const procesarComandoAdmin = async (socket, sender, command, args) => {
  if (!esAdministrador(sender)) {
    await socket.sendMessage(sender, { 
      text: '⛔ No tienes permisos para ejecutar comandos de administrador.' 
    });
    return;
  }
  
  switch (command) {
    case '!admin:help':
      await enviarAyudaAdmin(socket, sender);
      break;
      
    case '!admin:stats':
      await enviarEstadisticas(socket, sender);
      break;
      
    case '!admin:addcredits':
      await agregarCreditosUsuario(socket, sender, args);
      break;
      
    case '!admin:usuario':
      await mostrarInfoUsuario(socket, sender, args);
      break;
      
    case '!admin:importar':
      await importarNuevosMp3s(socket, sender);
      break;
      
    case '!admin:broadcast':
      await enviarMensajeMasivo(socket, sender, args);
      break;

    case '!admin:recargar':
      await recargarCreditos(socket, sender, args);
      break;
      
    default:
      await socket.sendMessage(sender, { 
        text: '❓ Comando de administrador desconocido. Usa !admin:help para ver los comandos disponibles.' 
      });
  }
};

/**
 * Envía información de ayuda para comandos admin
 */
const enviarAyudaAdmin = async (socket, sender) => {
  const message = `🔧 *Comandos de Administrador* 🔧\n\n` +
    `!admin:help - Muestra este mensaje de ayuda\n` +
    `!admin:stats - Muestra estadísticas del sistema\n` +
    `!admin:addcredits [numero] [cantidad] - Agrega créditos a un usuario\n` +
    `!admin:usuario [numero] - Muestra información de un usuario\n` +
    `!admin:importar - Importa nuevos archivos MP3 al sistema\n` +
    `!admin:broadcast [mensaje] - Envía un mensaje a todos los usuarios\n` +
    `!admin:recargar [cantidad] [dias] - Recarga créditos a usuarios activos`;
    
  await socket.sendMessage(sender, { text: message });
};

/**
 * Envía estadísticas del sistema
 */
const enviarEstadisticas = async (socket, sender) => {
  try {
    const cantidadUsuarios = await Usuario.count();
    const cantidadCanciones = await Cancion.count();
    const cantidadDescargas = await Descarga.count();
    
    // Usuarios recientes
    const usuariosRecientes = await Usuario.count({
      where: {
        ultimo_acceso: {
          [Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000) // Últimas 24 horas
        }
      }
    });
    
    // Descargas recientes
    const descargasRecientes = await Descarga.count({
      where: {
        fecha_descarga: {
          [Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000) // Últimas 24 horas
        }
      }
    });
    
    // Top 5 canciones más descargadas
    const topCanciones = await Descarga.findAll({
      attributes: [
        'id_cancion',
        [sequelize.fn('COUNT', sequelize.col('id_cancion')), 'descargas']
      ],
      include: [{
        model: Cancion,
        as: 'cancion',
        attributes: ['nombre', 'artista']
      }],
      group: ['id_cancion'],
      order: [[sequelize.fn('COUNT', sequelize.col('id_cancion')), 'DESC']],
      limit: 5
    });
    
    // Formatear mensaje
    let message = `📊 *Estadísticas del Sistema* 📊\n\n` +
      `👤 *Usuarios totales:* ${cantidadUsuarios}\n` +
      `🎵 *Canciones disponibles:* ${cantidadCanciones}\n` +
      `⬇️ *Descargas totales:* ${cantidadDescargas}\n\n` +
      `📅 *Actividad últimas 24h:*\n` +
      `👤 Usuarios activos: ${usuariosRecientes}\n` +
      `⬇️ Descargas: ${descargasRecientes}\n\n`;
      
    if (topCanciones.length > 0) {
      message += `🏆 *Top 5 canciones:*\n`;
      topCanciones.forEach((item, index) => {
        message += `${index + 1}. ${item.cancion?.nombre || 'Desconocida'} - ${item.cancion?.artista || 'Desconocido'}: ${item.dataValues.descargas} descargas\n`;
      });
    }
    
    await socket.sendMessage(sender, { text: message });
  } catch (error) {
    logger.error(`Error al obtener estadísticas: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Error al obtener estadísticas del sistema.' 
    });
  }
};

/**
 * Agrega créditos a un usuario
 */
const agregarCreditosUsuario = async (socket, sender, args) => {
  try {
    const argArray = args.split(' ');
    
    if (argArray.length < 2) {
      await socket.sendMessage(sender, { 
        text: '⚠️ Formato incorrecto. Uso: !admin:addcredits [numero] [cantidad]' 
      });
      return;
    }
    
    const numeroTelefono = argArray[0];
    const cantidad = parseInt(argArray[1]);
    
    if (isNaN(cantidad) || cantidad <= 0) {
      await socket.sendMessage(sender, { 
        text: '⚠️ La cantidad debe ser un número positivo.' 
      });
      return;
    }
    
    // Buscar usuario
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono }
    });
    
    if (!usuario) {
      await socket.sendMessage(sender, { 
        text: `❌ No se encontró ningún usuario con el número ${numeroTelefono}.` 
      });
      return;
    }
    
    // Agregar créditos
    const resultado = await creditoController.agregarCredito(
      numeroTelefono,
      cantidad,
      'regalo',
      'Créditos agregados por administrador'
    );
    
    if (resultado) {
      await socket.sendMessage(sender, { 
        text: `✅ Se han agregado ${cantidad} créditos a ${numeroTelefono}. Nuevo balance: ${usuario.creditos + cantidad} créditos.` 
      });
    } else {
      await socket.sendMessage(sender, { 
        text: '❌ Error al agregar créditos. Intenta nuevamente.' 
      });
    }
  } catch (error) {
    logger.error(`Error al agregar créditos: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Error al procesar la solicitud.' 
    });
  }
};

/**
 * Muestra información detallada de un usuario
 */
const mostrarInfoUsuario = async (socket, sender, args) => {
  try {
    if (!args) {
      await socket.sendMessage(sender, { 
        text: '⚠️ Debes especificar el número de teléfono del usuario.' 
      });
      return;
    }
    
    const numeroTelefono = args.trim();
    
    // Buscar usuario
    const usuario = await Usuario.findOne({
      where: { numero_telefono: numeroTelefono }
    });
    
    if (!usuario) {
      await socket.sendMessage(sender, { 
        text: `❌ No se encontró ningún usuario con el número ${numeroTelefono}.` 
      });
      return;
    }
    
    // Contar descargas del usuario
    const cantidadDescargas = await Descarga.count({
      where: { id_usuario: usuario.id }
    });
    
    // Obtener últimas transacciones
    const transacciones = await TransaccionCredito.findAll({
      where: { id_usuario: usuario.id },
      order: [['fecha_transaccion', 'DESC']],
      limit: 5
    });
    
    // Formatear mensaje
    let message = `👤 *Información de Usuario* 👤\n\n` +
      `📱 *Número:* ${usuario.numero_telefono}\n` +
      `👤 *Nombre:* ${usuario.nombre || 'No especificado'}\n` +
      `💳 *Créditos:* ${usuario.creditos}\n` +
      `📅 *Registro:* ${usuario.fecha_registro}\n` +
      `🕒 *Último acceso:* ${usuario.ultimo_acceso}\n` +
      `⬇️ *Descargas totales:* ${cantidadDescargas}\n\n`;
      
    if (transacciones.length > 0) {
      message += `💰 *Últimas transacciones:*\n`;
      transacciones.forEach((t) => {
        const fecha = t.fecha_transaccion.toISOString().split('T')[0];
        let tipoStr = '';
        
        switch (t.tipo) {
          case 'compra': tipoStr = '💵 Compra'; break;
          case 'uso': tipoStr = '⬇️ Uso'; break;
          case 'regalo': tipoStr = '🎁 Regalo'; break;
          case 'promocion': tipoStr = '🏷️ Promoción'; break;
          default: tipoStr = t.tipo;
        }
        
        message += `${fecha} | ${tipoStr}: ${t.cantidad > 0 ? '+' : ''}${t.cantidad}\n`;
      });
    }
    
    await socket.sendMessage(sender, { text: message });
  } catch (error) {
    logger.error(`Error al mostrar info de usuario: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Error al obtener información del usuario.' 
    });
  }
};

/**
 * Importa nuevos archivos MP3 al sistema
 */
const importarNuevosMp3s = async (socket, sender) => {
  try {
    await socket.sendMessage(sender, { 
      text: '⏳ Importando nuevos archivos MP3... Esto puede tardar unos minutos.' 
    });
    
    const cantidad = await importarTodos();
    
    if (cantidad > 0) {
      await socket.sendMessage(sender, { 
        text: `✅ Importación completada. Se han importado ${cantidad} nuevos archivos MP3.` 
      });
    } else {
      await socket.sendMessage(sender, { 
        text: '✅ Importación completada. No se encontraron nuevos archivos para importar.' 
      });
    }
  } catch (error) {
    logger.error(`Error al importar MP3s: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Error durante la importación de archivos.' 
    });
  }
};

/**
 * Envía un mensaje masivo a todos los usuarios
 */
const enviarMensajeMasivo = async (socket, sender, args) => {
  try {
    if (!args) {
      await socket.sendMessage(sender, { 
        text: '⚠️ Debes especificar el mensaje a enviar.\n\nEjemplo: !admin:broadcast ¡Hola a todos! Tenemos nuevas canciones disponibles.' 
      });
      return;
    }
    
    await socket.sendMessage(sender, { 
      text: '⏳ Preparando envío masivo...' 
    });
    
    // Enviar mensaje masivo
    const resultado = await mensajeriaService.enviarMensajeMasivo(
      { text: args },
      {}, // sin filtros, a todos los usuarios
      { intervalo: 1500 } // 1.5 segundos entre mensajes para evitar bloqueos
    );
    
    if (resultado.exito) {
      await socket.sendMessage(sender, { 
        text: `✅ Mensaje enviado correctamente\n📊 Estadísticas:\n- Destinatarios: ${resultado.destinatarios}\n- Enviados: ${resultado.enviados}\n- Fallidos: ${resultado.fallidos || 0}` 
      });
    } else {
      await socket.sendMessage(sender, { 
        text: `❌ Error al enviar mensaje: ${resultado.error}` 
      });
    }
  } catch (error) {
    logger.error(`Error en broadcast: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: '❌ Error al enviar mensaje masivo.' 
    });
  }
};

/**
 * Recarga créditos a usuarios activos
 */
const recargarCreditos = async (socket, sender, args) => {
  try {
    const argArray = args.split(' ');
    
    if (argArray.length < 2) {
      await socket.sendMessage(sender, { 
        text: '⚠️ Formato incorrecto. Uso: !admin:recargar [cantidad] [dias_activo]\nEjemplo: !admin:recargar 5 7' 
      });
      return;
    }
    
    const cantidad = parseInt(argArray[0]);
    const diasActivo = parseInt(argArray[1]);
    
    if (isNaN(cantidad) || cantidad <= 0 || isNaN(diasActivo) || diasActivo <= 0) {
      await socket.sendMessage(sender, { 
        text: '⚠️ La cantidad y los días deben ser números positivos.' 
      });
      return;
    }
    
    await socket.sendMessage(sender, { 
      text: `⏳ Recargando ${cantidad} créditos a usuarios activos en los últimos ${diasActivo} días...` 
    });
    
    // Fecha límite para considerar usuario activo
    const fechaLimite = new Date(Date.now() - (diasActivo * 24 * 60 * 60 * 1000));
    
    // Buscar usuarios activos
    const usuariosActivos = await Usuario.findAll({
      where: {
        ultimo_acceso: {
          [Op.gte]: fechaLimite
        }
      }
    });
    
    if (usuariosActivos.length === 0) {
      await socket.sendMessage(sender, { 
        text: `⚠️ No se encontraron usuarios activos en los últimos ${diasActivo} días.` 
      });
      return;
    }
    
    // Iniciar una transacción
    const t = await sequelize.transaction();
    
    try {
      let exitosos = 0;
      
      // Recargar créditos a cada usuario
      for (const usuario of usuariosActivos) {
        await creditoController.agregarCredito(
          usuario.numero_telefono,
          cantidad,
          'promocion',
          'Recarga automática para usuarios activos',
          t
        );
        exitosos++;
      }
      
      // Confirmar transacción
      await t.commit();
      
      // Enviar mensaje de confirmación
      await socket.sendMessage(sender, { 
        text: `✅ Recarga completada con éxito\n📊 Estadísticas:\n- Usuarios beneficiados: ${exitosos}\n- Créditos por usuario: ${cantidad}\n- Total créditos: ${exitosos * cantidad}` 
      });
      
      // Notificar a los usuarios que recibieron créditos
      const notificacion = { text: `🎁 *¡Regalo de créditos!*\n\nHas recibido ${cantidad} créditos gratis por tu actividad reciente en Bot Chiveros. ¡Disfrútalos descargando tus canciones favoritas!` };
      
      mensajeriaService.enviarMensajeMasivo(
        notificacion,
        { ultimoAcceso: diasActivo },
        { intervalo: 2000 }
      ).catch(err => logger.error(`Error al notificar recarga: ${err.message}`));
      
    } catch (error) {
      // Revertir transacción en caso de error
      await t.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error en recarga de créditos: ${error.message}`);
    await socket.sendMessage(sender, { 
      text: `❌ Error al recargar créditos: ${error.message}` 
    });
  }
};

module.exports = {
  procesarComandoAdmin,
  esAdministrador
};
