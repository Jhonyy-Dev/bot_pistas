/**
 * Dashboard Web para administración del BOT_PISTAS
 * Incluye visualización de QR, estadísticas y logs
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { Usuario, Cancion, TransaccionCredito, Descarga } = require('../database/models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const logger = require('../config/logger');

// Estado global del bot
let botStatus = {
  isConnected: false,
  qrCode: null,
  lastConnection: null,
  totalUsers: 0,
  totalSongs: 0,
  totalDownloads: 0
};

// Referencia al servicio de WhatsApp (se asignará dinámicamente)
let whatsappServiceRef = null;

/**
 * Actualizar estado del bot desde WhatsApp Service
 */
function updateBotStatus(status) {
  botStatus = { ...botStatus, ...status };
}

/**
 * Asignar referencia al servicio de WhatsApp
 */
function setWhatsAppServiceRef(service) {
  whatsappServiceRef = service;
}

// Endpoint principal del dashboard
router.get('/', async (req, res) => {
    try {
        res.render('dashboard');
    } catch (error) {
        logger.error('Error renderizando dashboard:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para obtener datos del dashboard
router.get('/api/dashboard-data', async (req, res) => {
  try {
    // Verificar si el servicio de WhatsApp está disponible
    if (!whatsappServiceRef) {
      logger.warn('Servicio de WhatsApp no disponible al solicitar datos del dashboard');
      return res.status(503).json({ 
        success: false,
        error: 'Servicio de WhatsApp no disponible',
        connected: false,
        qrCode: null,
        lastConnection: null,
        stats: {
          usuariosRegistrados: 0,
          cancionesDisponibles: 0,
          descargasTotales: 0
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Obtener estado de conexión y QR
    let connected = false;
    let qrCode = null;
    let lastConnection = null;
    
    try {
      connected = whatsappServiceRef.isConnected;
      qrCode = whatsappServiceRef.qrCode;
      lastConnection = whatsappServiceRef.lastConnection || botStatus.lastConnection;
      
      // Log para debugging
      logger.debug(`Dashboard data - Connected: ${connected}, QR available: ${qrCode ? 'Yes' : 'No'}`);
    } catch (whatsappError) {
      logger.error(`Error al obtener estado de WhatsApp: ${whatsappError.message}`);
      // Continuar con valores por defecto
    }
    
    // Obtener estadísticas del bot
    let stats = {
      usuariosRegistrados: 0,
      cancionesDisponibles: 0,
      descargasTotales: 0
    };
    
    try {
      const estadisticasCompletas = await obtenerEstadisticasCompletas();
      
      // Extraer solo los datos básicos de resumen para el dashboard principal
      stats = {
        usuariosRegistrados: estadisticasCompletas.resumen.totalUsuarios || 0,
        cancionesDisponibles: estadisticasCompletas.resumen.totalCanciones || 0,
        descargasTotales: estadisticasCompletas.resumen.totalDescargas || 0
      };
      
      logger.info(`Estadísticas obtenidas: Usuarios=${stats.usuariosRegistrados}, Canciones=${stats.cancionesDisponibles}, Descargas=${stats.descargasTotales}`);
    } catch (statsError) {
      logger.error(`Error al obtener estadísticas: ${statsError.message}`);
      // Continuamos con las estadísticas por defecto
    }
    
    // Siempre devolver un JSON válido con todos los campos necesarios
    return res.json({
      success: true,
      connected,
      qrCode,
      lastConnection,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error general al obtener datos del dashboard: ${error.message}`);
    // En caso de error, devolver una respuesta de error pero con estructura válida
    return res.status(500).json({ 
      success: false,
      error: error.message,
      connected: false,
      qrCode: null,
      lastConnection: null,
      stats: {
        usuariosRegistrados: 0,
        cancionesDisponibles: 0,
        descargasTotales: 0
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * API para obtener estado del bot (AJAX)
 */
router.get('/api/status', async (req, res) => {
  try {
    // Actualizar estadísticas en tiempo real
    const [totalUsers, totalSongs, totalDownloads] = await Promise.all([
      Usuario.count(),
      Cancion.count(),
      TransaccionCredito.count({ where: { tipo: 'descarga' } })
    ]);

    const currentStatus = {
      ...botStatus,
      totalUsers,
      totalSongs,
      totalDownloads,
      timestamp: new Date().toISOString()
    };

    res.json(currentStatus);
  } catch (error) {
    logger.error(`Error en API status: ${error.message}`);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * API para cerrar sesión de WhatsApp y limpiar archivos de sesión
 */
router.post('/api/logout', async (req, res) => {
  try {
    logger.info('Iniciando proceso de logout de WhatsApp...');
    
    // Verificar que tenemos referencia al servicio de WhatsApp
    if (!whatsappServiceRef) {
      logger.error('No hay referencia al servicio de WhatsApp');
      return res.status(500).json({ 
        success: false, 
        message: 'Servicio de WhatsApp no disponible' 
      });
    }

    // Cerrar sesión de WhatsApp
    try {
      await whatsappServiceRef.logout();
      logger.info('Sesión de WhatsApp cerrada correctamente');
    } catch (logoutError) {
      logger.warn('Error al cerrar sesión de WhatsApp:', logoutError.message);
      // Continuar con la limpieza de archivos aunque falle el logout
    }

    // Limpiar archivos de sesión
    const sessionFolder = process.env.SESSION_FOLDER || './sessions';
    const fs = require('fs-extra');
    
    try {
      await fs.emptyDir(sessionFolder);
      logger.info(`Archivos de sesión eliminados de: ${sessionFolder}`);
    } catch (cleanupError) {
      logger.error('Error limpiando archivos de sesión:', cleanupError.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Error limpiando archivos de sesión' 
      });
    }

    // Actualizar estado del bot
    updateBotStatus({
      isConnected: false,
      qrCode: null,
      lastConnection: new Date().toLocaleString()
    });

    // Reinicializar servicio WhatsApp después de un breve delay
    setTimeout(async () => {
      try {
        logger.info('Reinicializando servicio de WhatsApp...');
        await whatsappServiceRef.initialize();
        logger.info('Servicio de WhatsApp reinicializado correctamente');
      } catch (reinitError) {
        logger.error('Error reinicializando WhatsApp:', reinitError.message);
      }
    }, 2000);

    res.json({ 
      success: true, 
      message: 'Sesión cerrada y archivos limpiados correctamente' 
    });

  } catch (error) {
    logger.error('Error en proceso de logout:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// Endpoint para reiniciar el código QR
router.post('/api/reset-qr', async (req, res) => {
  try {
    if (!whatsappServiceRef) {
      throw new Error('Servicio de WhatsApp no disponible');
    }
    
    // Limpiar archivos de sesión
    try {
      const sessionDir = path.join(process.cwd(), '.wwebjs_auth');
      await fs.emptyDir(sessionDir);
      logger.info('Archivos de sesión eliminados correctamente');
    } catch (fsError) {
      logger.warn(`Error al limpiar archivos de sesión: ${fsError.message}`);
      // Continuamos aunque falle la limpieza de archivos
    }
    
    // Reiniciar el servicio de WhatsApp
    if (whatsappServiceRef && typeof whatsappServiceRef.reiniciar === 'function') {
      await whatsappServiceRef.reiniciar();
      logger.info('Servicio de WhatsApp reiniciado correctamente desde API');
    } else {
      logger.warn('No se pudo reiniciar el servicio de WhatsApp: método no disponible');
    }
    
    // Responder siempre con JSON válido
    return res.json({ 
      success: true, 
      message: 'Código QR reiniciado correctamente',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error(`Error al reiniciar QR: ${error.message}`);
    // Asegurar que siempre devolvemos un JSON válido incluso en caso de error
    return res.status(500).json({ 
      success: false, 
      message: `Error al reiniciar QR: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * API para obtener QR Code
 */
router.get('/api/qr', (req, res) => {
  res.json({ 
    qrCode: botStatus.qrCode,
    isConnected: botStatus.isConnected,
    timestamp: new Date().toISOString()
  });
});

/**
 * API para logs recientes
 */
router.get('/api/logs', (req, res) => {
  // Aquí podrías implementar lectura de logs
  // Por ahora retornamos logs simulados
  const logs = [
    { level: 'info', message: 'Bot iniciado correctamente', timestamp: new Date() },
    { level: 'info', message: `${botStatus.totalUsers} usuarios registrados`, timestamp: new Date() },
    { level: 'info', message: `${botStatus.totalSongs} canciones disponibles`, timestamp: new Date() }
  ];
  
  res.json(logs);
});

/**
 * Página de estadísticas detalladas
 */
router.get('/stats', async (req, res) => {
  try {
    // Obtener estadísticas completas y profesionales
    const stats = await obtenerEstadisticasCompletas();
    
    res.render('stats', { 
      title: 'Estadísticas Detalladas - BOT_PISTAS',
      stats,
      timestamp: new Date().toLocaleString()
    });
  } catch (error) {
    logger.error(`Error en estadísticas: ${error.message}`);
    res.status(500).render('error', { error: 'Error interno del servidor' });
  }
});

/**
 * API para estadísticas completas (AJAX)
 */
router.get('/api/stats', async (req, res) => {
  try {
    const stats = await obtenerEstadisticasCompletas();
    res.json(stats);
  } catch (error) {
    logger.error(`Error en API estadísticas: ${error.message}`);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * Función para obtener estadísticas completas y profesionales
 */
async function obtenerEstadisticasCompletas() {
  try {
    // Consultas paralelas para optimizar rendimiento
    const [
      // Estadísticas básicas
      totalUsuarios,
      totalCanciones,
      totalDescargas,
      
      // Usuarios más activos
      usuariosActivos,
      
      // Canciones más populares
      cancionesMasDescargadas,
      
      // Estadísticas por fecha
      descargasHoy,
      descargasAyer,
      descargasSemana,
      descargasMes,
      
      // Canciones más populares por popularidad
      cancionesPopulares,
      
      // Distribución de géneros (si existe esa columna)
      distribucionGeneros,
      
      // Usuarios nuevos por período
      usuariosNuevosHoy,
      usuariosNuevosAyer,
      usuariosNuevosSemana,
      usuariosNuevosMes,
      
      // Géneros más populares
      generosMasPopulares,
      
      // Artistas más buscados
      artistasMasBuscados,
      
      // Actividad por horas
      actividadPorHoras
    ] = await Promise.all([
      // Básicas
      Usuario.count(),
      Cancion.count(),
      Descarga.count(),
      
      // Usuarios más activos (últimos 30 días)
      sequelize.query(`
        SELECT u.nombre, u.numero_telefono, COUNT(d.id) as total_descargas
        FROM usuarios u
        LEFT JOIN descargas d ON u.id = d.id_usuario 
        WHERE d.fecha_descarga >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY u.id
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Canciones más descargadas
      sequelize.query(`
        SELECT c.nombre, c.artista, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.id_cancion
        GROUP BY c.id, c.nombre, c.artista
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Estadísticas por fecha
      sequelize.query(`
        SELECT COUNT(*) as descargas_hoy
        FROM descargas 
        WHERE DATE(fecha_descarga) = CURDATE()
      `, { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) as descargas_ayer
        FROM descargas 
        WHERE DATE(fecha_descarga) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      `, { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) as descargas_semana
        FROM descargas 
        WHERE fecha_descarga >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      `, { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) as descargas_mes
        FROM descargas 
        WHERE fecha_descarga >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Canciones más populares por popularidad
      sequelize.query(`
        SELECT c.nombre, c.artista, c.popularidad
        FROM canciones c
        WHERE c.popularidad > 0
        ORDER BY c.popularidad DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Distribución de géneros (si existe esa columna)
      sequelize.query(`
        SELECT c.genero, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.id_cancion
        WHERE c.genero IS NOT NULL
        GROUP BY c.genero
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Usuarios nuevos por período
      sequelize.query(`
        SELECT COUNT(*) as usuarios_nuevos_hoy
        FROM usuarios 
        WHERE DATE(fecha_registro) = CURDATE()
      `, { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) as usuarios_nuevos_ayer
        FROM usuarios 
        WHERE DATE(fecha_registro) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      `, { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) as usuarios_nuevos_semana
        FROM usuarios 
        WHERE fecha_registro >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      `, { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) as usuarios_nuevos_mes
        FROM usuarios 
        WHERE fecha_registro >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Géneros más populares
      sequelize.query(`
        SELECT c.genero, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.id_cancion
        WHERE c.genero IS NOT NULL
        GROUP BY c.genero
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Artistas más buscados
      sequelize.query(`
        SELECT c.artista, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.id_cancion
        WHERE c.artista IS NOT NULL
        GROUP BY c.artista
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Actividad por horas
      sequelize.query(`
        SELECT HOUR(fecha_descarga) as hora, COUNT(*) as actividad
        FROM descargas
        WHERE fecha_descarga >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY HOUR(fecha_descarga)
        ORDER BY hora
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    return {
      // Resumen general
      resumen: {
        totalUsuarios,
        totalCanciones,
        totalDescargas,
      },
      
      // Actividad por período
      actividad: {
        descargasHoy: descargasHoy[0]?.descargas_hoy || 0,
        descargasAyer: descargasAyer[0]?.descargas_ayer || 0,
        descargasSemana: descargasSemana[0]?.descargas_semana || 0,
        descargasMes: descargasMes[0]?.descargas_mes || 0,
        usuariosNuevosHoy: usuariosNuevosHoy[0]?.usuarios_nuevos_hoy || 0,
        usuariosNuevosAyer: usuariosNuevosAyer[0]?.usuarios_nuevos_ayer || 0,
        usuariosNuevosSemana: usuariosNuevosSemana[0]?.usuarios_nuevos_semana || 0,
        usuariosNuevosMes: usuariosNuevosMes[0]?.usuarios_nuevos_mes || 0
      },
      
      // Rankings
      rankings: {
        usuariosActivos: usuariosActivos.slice(0, 10),
        cancionesMasDescargadas: cancionesMasDescargadas.slice(0, 10),
        cancionesPopulares: cancionesPopulares.slice(0, 10),
        generosMasPopulares: distribucionGeneros.slice(0, 8),
        artistasMasBuscados: artistasMasBuscados.slice(0, 10)
      },
      
      // Gráficos
      graficos: {
        actividadPorHoras: actividadPorHoras
      }
    };
    
  } catch (error) {
    logger.error(`Error obteniendo estadísticas completas: ${error.message}`);
    throw error;
  }
}

module.exports = { router, updateBotStatus, setWhatsAppServiceRef };
