/**
 * Dashboard Web para administración del BOT_PISTAS
 * Incluye visualización de QR, estadísticas y logs
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { Usuario, Cancion, TransaccionCredito } = require('../database/models');
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

/**
 * Actualizar estado del bot desde WhatsApp Service
 */
function updateBotStatus(status) {
  botStatus = { ...botStatus, ...status };
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
    // Obtener estadísticas detalladas
    const stats = {
      usuarios: await Usuario.findAll({
        attributes: ['nombre', 'creditos', 'fecha_registro'],
        order: [['fecha_registro', 'DESC']],
        limit: 10
      }),
      canciones: await Cancion.findAll({
        attributes: ['nombre', 'artista', 'popularidad'],
        order: [['popularidad', 'DESC']],
        limit: 10
      }),
      descargas: await TransaccionCredito.findAll({
        where: { tipo: 'descarga' },
        order: [['fecha_transaccion', 'DESC']],
        limit: 10,
        include: [{ model: Usuario, attributes: ['nombre'] }]
      })
    };

    res.render('stats', { 
      title: 'Estadísticas Detalladas',
      stats
    });
  } catch (error) {
    logger.error(`Error en estadísticas: ${error.message}`);
    res.status(500).render('error', { error: 'Error interno del servidor' });
  }
});

module.exports = { router, updateBotStatus };
