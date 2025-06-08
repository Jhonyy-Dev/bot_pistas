/**
 * Servicio para gestionar mensajería masiva y notificaciones
 */

const { Op } = require('sequelize');
const logger = require('../config/logger');
const { Usuario } = require('../database/models');
const whatsappService = require('./whatsappService');

/**
 * Envía un mensaje a todos los usuarios o a un grupo específico
 * @param {string} mensaje - Mensaje a enviar
 * @param {Array} filtros - Filtros para seleccionar usuarios (opcional)
 * @param {Object} opciones - Opciones adicionales
 * @returns {Promise<Object>} Resultado de la operación
 */
const enviarMensajeMasivo = async (mensaje, filtros = {}, opciones = {}) => {
  try {
    logger.info('Iniciando envío de mensaje masivo...');
    
    // Verificar conexión WhatsApp
    if (!whatsappService.isConnected) {
      logger.error('No hay conexión a WhatsApp para enviar mensaje masivo');
      return { exito: false, error: 'No hay conexión a WhatsApp', destinatarios: 0, enviados: 0 };
    }
    
    // Construir filtro para la consulta
    const whereClause = {};
    
    if (filtros.ultimoAcceso) {
      whereClause.ultimo_acceso = {
        [Op.gte]: new Date(Date.now() - filtros.ultimoAcceso * 24 * 60 * 60 * 1000)
      };
    }
    
    if (filtros.creditosMinimos !== undefined) {
      whereClause.creditos = {
        [Op.gte]: filtros.creditosMinimos
      };
    }
    
    // Obtener usuarios
    const usuarios = await Usuario.findAll({
      where: whereClause
    });
    
    if (usuarios.length === 0) {
      logger.warn('No se encontraron usuarios para enviar el mensaje masivo');
      return { exito: true, destinatarios: 0, enviados: 0, mensaje: 'No hay usuarios que cumplan con los filtros' };
    }
    
    logger.info(`Preparando envío a ${usuarios.length} usuarios...`);
    
    // Enviar mensajes con intervalo para evitar bloqueos
    let enviados = 0;
    let fallidos = 0;
    const detalles = [];
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const intervalo = opciones.intervalo || 1000; // 1 segundo por defecto
    
    for (const usuario of usuarios) {
      try {
        // Formar número completo con código de país si no lo tiene
        let numeroCompleto = usuario.numero_telefono;
        if (!numeroCompleto.includes('@')) {
          numeroCompleto = `${numeroCompleto}@s.whatsapp.net`;
        }
        
        // Enviar mensaje
        const resultado = await whatsappService.sendMessage(numeroCompleto, mensaje);
        
        if (resultado) {
          enviados++;
          detalles.push({ numero: usuario.numero_telefono, estado: 'enviado' });
        } else {
          fallidos++;
          detalles.push({ numero: usuario.numero_telefono, estado: 'fallido' });
        }
        
        // Esperar antes de enviar el siguiente
        await delay(intervalo);
        
      } catch (error) {
        logger.error(`Error al enviar mensaje a ${usuario.numero_telefono}: ${error.message}`);
        fallidos++;
        detalles.push({ numero: usuario.numero_telefono, estado: 'error', mensaje: error.message });
      }
    }
    
    logger.info(`Mensaje masivo completado. Enviados: ${enviados}, Fallidos: ${fallidos}`);
    
    return {
      exito: true,
      destinatarios: usuarios.length,
      enviados,
      fallidos,
      detalles: opciones.incluirDetalles ? detalles : undefined
    };
  } catch (error) {
    logger.error(`Error general en envío masivo: ${error.message}`);
    return { exito: false, error: error.message, destinatarios: 0, enviados: 0 };
  }
};

/**
 * Envía una notificación a los administradores
 * @param {string} mensaje - Mensaje a enviar
 * @param {Array} adminNumbers - Lista de números de administradores
 * @returns {Promise<boolean>} true si se envió al menos a un administrador
 */
const notificarAdministradores = async (mensaje, adminNumbers) => {
  try {
    if (!whatsappService.isConnected) {
      logger.error('No hay conexión a WhatsApp para notificar a administradores');
      return false;
    }
    
    let enviado = false;
    
    for (const numero of adminNumbers) {
      try {
        // Formar número completo
        const numeroCompleto = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
        
        // Enviar notificación
        const resultado = await whatsappService.sendMessage(numeroCompleto, mensaje);
        
        if (resultado) {
          enviado = true;
          logger.info(`Notificación enviada a administrador ${numero}`);
        }
      } catch (error) {
        logger.error(`Error al notificar a administrador ${numero}: ${error.message}`);
      }
    }
    
    return enviado;
  } catch (error) {
    logger.error(`Error general en notificación a administradores: ${error.message}`);
    return false;
  }
};

module.exports = {
  enviarMensajeMasivo,
  notificarAdministradores
};
