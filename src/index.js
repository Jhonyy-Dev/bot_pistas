require('dotenv').config();

// Cargar polyfills ANTES que cualquier dependencia
require('./polyfills');

const express = require('express');
const path = require('path');
const logger = require('./config/logger');
const { sequelize, testConnection } = require('./config/database');
const whatsappService = require('./services/whatsappService');
const { importarMp3s } = require('./utils/fileUtils');
const { iniciarServicioMantenimiento } = require('./services/maintenanceService');

// Inicializar la aplicación express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar motor de plantillas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Importar rutas del dashboard
const { router: dashboardRouter } = require('./routes/dashboard');
app.use('/dashboard', dashboardRouter);

// Ruta principal - redirigir al dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Ruta para verificar estado del bot (API)
app.get('/api/status', (req, res) => {
  res.json({
    whatsapp: whatsappService.isConnected ? 'conectado' : 'desconectado',
    qrCode: whatsappService.qrCode ? 'disponible' : 'no disponible',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
async function iniciarServidor() {
  try {
    // Verificar si se debe usar la base de datos
    const usarDB = process.env.USAR_DB === 'true';
    // Variable para controlar si la base de datos está conectada
    let dbConectada = false;
    
    if (usarDB) {
      // Probar conexión a la base de datos
      logger.info('Probando conexión a la base de datos...');
      dbConectada = await testConnection();
      
      if (!dbConectada) {
        logger.error('No se pudo conectar a la base de datos. Verifica la configuración.');
        logger.warn('Continuando sin base de datos. Algunas funcionalidades estarán limitadas.');
      } else {
        // Sincronizar modelos con la base de datos
        logger.info('Sincronizando modelos con la base de datos...');
        await sequelize.sync();
      }
    } else {
      logger.info('Modo sin base de datos activado. Usando solo Backblaze B2 para almacenamiento.');
    }
    
    // Iniciar el servidor HTTP
    app.listen(PORT, () => {
      logger.info(`Servidor iniciado en el puerto ${PORT}`);
      
      // Iniciar el servicio de WhatsApp
      iniciarServicioWhatsApp();
      
      // Importar MP3s disponibles
      importarMp3Disponibles();
      
      // Iniciar el servicio de mantenimiento automático
      if (usarDB && dbConectada) {
        logger.info('Iniciando servicio de mantenimiento automático de la base de datos...');
        iniciarServicioMantenimiento();
      }
    });
  } catch (error) {
    logger.error(`Error al iniciar el servidor: ${error.message}`);
    process.exit(1);
  }
}

// Iniciar el servicio de WhatsApp
async function iniciarServicioWhatsApp() {
  try {
    logger.info('Iniciando servicio de WhatsApp...');
    const resultado = await whatsappService.initialize();
    
    if (resultado) {
      logger.info('Servicio de WhatsApp iniciado correctamente');
    } else {
      logger.error('No se pudo iniciar el servicio de WhatsApp');
    }
  } catch (error) {
    logger.error(`Error al iniciar servicio de WhatsApp: ${error.message}`);
  }
}

// Importar MP3s disponibles
async function importarMp3Disponibles() {
  try {
    logger.info('Escaneando e importando archivos MP3...');
    const importados = await importarMp3s();
    logger.info(`Se importaron ${importados} nuevos archivos MP3`);
  } catch (error) {
    logger.error(`Error al importar MP3s: ${error.message}`);
  }
}

// Manejo de señales de terminación
process.on('SIGINT', async () => {
  logger.info('Cerrando aplicación...');
  process.exit(0);
});

// Iniciar el servidor
iniciarServidor();
