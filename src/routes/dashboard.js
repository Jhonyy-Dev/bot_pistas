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

/**
 * Página principal del dashboard
 */
router.get('/', async (req, res) => {
  try {
    // Obtener estadísticas actualizadas
    const [totalUsers, totalSongs, totalDownloads] = await Promise.all([
      Usuario.count(),
      Cancion.count(),
      TransaccionCredito.count({ where: { tipo: 'descarga' } })
    ]);

    botStatus.totalUsers = totalUsers;
    botStatus.totalSongs = totalSongs;
    botStatus.totalDownloads = totalDownloads;

    res.render('dashboard', { 
      title: 'BOT_PISTAS Dashboard',
      botStatus,
      timestamp: new Date().toLocaleString()
    });
  } catch (error) {
    logger.error(`Error en dashboard: ${error.message}`);
    res.status(500).render('error', { error: 'Error interno del servidor' });
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
 * API para cerrar sesión del bot y generar nuevo QR
 */
router.post('/api/logout', async (req, res) => {
  try {
    logger.info('Iniciando cierre de sesión del bot...');
    
    // 1. Cerrar conexión actual si existe
    if (whatsappServiceRef && whatsappServiceRef.socket) {
      try {
        await whatsappServiceRef.socket.logout();
        logger.info('Sesión de WhatsApp cerrada correctamente');
      } catch (logoutError) {
        logger.warn(`Error al cerrar sesión: ${logoutError.message}`);
      }
    }

    // 2. Borrar archivos de sesión
    const sessionDir = path.resolve(process.env.SESSION_FOLDER || './sessions');
    
    if (await fs.pathExists(sessionDir)) {
      try {
        await fs.emptyDir(sessionDir);
        logger.info('Archivos de sesión eliminados correctamente');
      } catch (deleteError) {
        logger.error(`Error eliminando archivos de sesión: ${deleteError.message}`);
      }
    }

    // 3. Actualizar estado del bot
    updateBotStatus({
      isConnected: false,
      qrCode: null,
      lastConnection: new Date().toLocaleString()
    });

    // 4. Reinicializar servicio de WhatsApp después de un breve delay
    setTimeout(async () => {
      if (whatsappServiceRef) {
        try {
          logger.info('Reinicializando servicio de WhatsApp...');
          await whatsappServiceRef.initialize();
        } catch (reinitError) {
          logger.error(`Error reinicializando WhatsApp: ${reinitError.message}`);
        }
      }
    }, 2000);

    res.json({ 
      success: true, 
      message: 'Sesión cerrada correctamente. Nuevo QR se generará en breve.' 
    });

  } catch (error) {
    logger.error(`Error en logout: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
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
      descargasEstaSemana,
      descargasEsteMes,
      
      // Usuarios nuevos
      usuariosNuevosHoy,
      usuariosNuevosEstaSemana,
      usuariosNuevosEsteMes,
      
      // Géneros más populares
      generosMasPopulares,
      
      // Artistas más buscados
      artistasMasBuscados,
      
      // Estadísticas de créditos
      totalCreditosUsados,
      totalCreditosRecargados,
      
      // Actividad por horas
      actividadPorHoras
      
    ] = await Promise.all([
      // Básicas
      Usuario.count(),
      Cancion.count(),
      TransaccionCredito.count({ where: { tipo: 'descarga' } }),
      
      // Usuarios más activos (últimos 30 días)
      sequelize.query(`
        SELECT u.nombre, u.numero_telefono, COUNT(tc.id) as total_descargas
        FROM usuarios u
        LEFT JOIN transacciones_credito tc ON u.id = tc.usuario_id 
        WHERE tc.tipo = 'descarga' AND tc.fecha_transaccion >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY u.id
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Canciones más descargadas
      sequelize.query(`
        SELECT c.nombre, c.artista, c.genero, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.cancion_id
        WHERE d.fecha_descarga >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY c.id
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Descargas por período
      TransaccionCredito.count({ 
        where: { 
          tipo: 'descarga',
          fecha_transaccion: {
            [sequelize.Op.gte]: new Date(new Date().setHours(0,0,0,0))
          }
        } 
      }),
      TransaccionCredito.count({ 
        where: { 
          tipo: 'descarga',
          fecha_transaccion: {
            [sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        } 
      }),
      TransaccionCredito.count({ 
        where: { 
          tipo: 'descarga',
          fecha_transaccion: {
            [sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        } 
      }),
      
      // Usuarios nuevos por período
      Usuario.count({ 
        where: { 
          fecha_registro: {
            [sequelize.Op.gte]: new Date(new Date().setHours(0,0,0,0))
          }
        } 
      }),
      Usuario.count({ 
        where: { 
          fecha_registro: {
            [sequelize.Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        } 
      }),
      Usuario.count({ 
        where: { 
          fecha_registro: {
            [sequelize.Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        } 
      }),
      
      // Géneros más populares
      sequelize.query(`
        SELECT c.genero, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.cancion_id
        WHERE c.genero IS NOT NULL AND c.genero != ''
        GROUP BY c.genero
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Artistas más buscados
      sequelize.query(`
        SELECT c.artista, COUNT(d.id) as total_descargas
        FROM canciones c
        LEFT JOIN descargas d ON c.id = d.cancion_id
        WHERE c.artista IS NOT NULL AND c.artista != ''
        GROUP BY c.artista
        ORDER BY total_descargas DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Créditos
      sequelize.query(`
        SELECT SUM(CASE WHEN tipo = 'descarga' THEN ABS(cantidad) ELSE 0 END) as creditos_usados,
               SUM(CASE WHEN tipo = 'recarga' THEN cantidad ELSE 0 END) as creditos_recargados
        FROM transacciones_credito
      `, { type: sequelize.QueryTypes.SELECT }),
      
      // Actividad por horas
      sequelize.query(`
        SELECT HOUR(fecha_transaccion) as hora, COUNT(*) as actividad
        FROM transacciones_credito
        WHERE fecha_transaccion >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY HOUR(fecha_transaccion)
        ORDER BY hora
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    return {
      // Resumen general
      resumen: {
        totalUsuarios,
        totalCanciones,
        totalDescargas,
        totalCreditosUsados: totalCreditosUsados[0]?.creditos_usados || 0,
        totalCreditosRecargados: totalCreditosUsados[0]?.creditos_recargados || 0
      },
      
      // Actividad por período
      actividad: {
        descargasHoy,
        descargasEstaSemana,
        descargasEsteMes,
        usuariosNuevosHoy,
        usuariosNuevosEstaSemana,
        usuariosNuevosEsteMes
      },
      
      // Rankings
      rankings: {
        usuariosActivos: usuariosActivos.slice(0, 10),
        cancionesMasDescargadas: cancionesMasDescargadas.slice(0, 10),
        generosMasPopulares: generosMasPopulares.slice(0, 8),
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
