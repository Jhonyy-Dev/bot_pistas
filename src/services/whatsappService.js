const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../config/logger');
const { processMessage } = require('../controllers/messageController');
const SessionCleaner = require('../utils/sessionCleaner');

// Asegurarse de que el directorio de sesiones existe
const SESSION_DIR = path.resolve(process.env.SESSION_FOLDER || './sessions');
fs.ensureDirSync(SESSION_DIR);

// Configurar el limpiador de sesiones
const sessionCleaner = new SessionCleaner(
  SESSION_DIR,
  3,  // Mantener solo 3 archivos de sesión más recientes
  12   // Limpiar cada 12 horas
);

class WhatsAppService {
  constructor() {
    this.socket = null;
    this.qrCode = null;
    this.isConnected = false;
    this.authState = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.sessionCleaner = sessionCleaner;
  }

  /**
   * Inicializa la conexión de WhatsApp
   */
  async initialize() {
    try {
      logger.info('Iniciando servicio de WhatsApp...');
      
      // Iniciar limpiador de sesiones
      this.sessionCleaner.start();
      
      // Ejecutar limpieza inicial para eliminar sesiones antiguas
      await this.sessionCleaner.cleanSessionsNow();
      
      // Cargar estado de autenticación
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      this.authState = { state, saveCreds };
      
      // Crear el socket de WhatsApp
      this.socket = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        defaultQueryTimeoutMs: 60000,
        logger: logger
      });
      
      // Asignar manejadores de eventos
      this.assignEventHandlers();
      
      logger.info('Servicio de WhatsApp inicializado');
      return true;
    } catch (error) {
      logger.error('Error al inicializar servicio de WhatsApp:', error);
      return false;
    }
  }
  
  /**
   * Asigna los manejadores de eventos al socket de WhatsApp
   */
  assignEventHandlers() {
    // Evento de conexión/desconexión
    this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
    
    // Evento para guardar credenciales
    this.socket.ev.on('creds.update', this.authState.saveCreds);
    
    // Evento para mensajes
    this.socket.ev.on('messages.upsert', this.handleMessage.bind(this));
  }
  
  /**
   * Maneja las actualizaciones de conexión
   */
  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    
    // Mostrar código QR si está disponible
    if (qr) {
      this.qrCode = qr;
      logger.info('Nuevo código QR generado. Por favor escanee con su WhatsApp:');
      qrcode.generate(qr, { small: true });
    }
    
    // Manejar estado de conexión
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      logger.warn(`Conexión cerrada debido a: ${lastDisconnect.error}`);
      
      if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.info(`Intentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.initialize(), 5000);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error('Número máximo de intentos de reconexión alcanzados. Por favor reinicie la aplicación.');
      }
      
      this.isConnected = false;
    } else if (connection === 'open') {
      logger.info('¡Conexión establecida con WhatsApp!');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    }
  }
  
  /**
   * Maneja los mensajes entrantes
   */
  async handleMessage(messageUpdate) {
    const { messages, type } = messageUpdate;
    
    // Solo procesar mensajes nuevos
    if (type !== 'notify') return;
    
    for (const message of messages) {
      // Ignorar mensajes de estado y propios
      if (message.key.remoteJid === 'status@broadcast') continue;
      if (message.key.fromMe) continue;
      
      // Solo procesar mensajes de texto
      const messageContent = message.message?.conversation || 
                          message.message?.extendedTextMessage?.text ||
                          message.message?.buttonsResponseMessage?.selectedButtonId ||
                          message.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
      
      if (!messageContent) continue;
      
      const sender = message.key.remoteJid;
      
      try {
        // Enviar a controlador para procesar
        await processMessage(this.socket, sender, messageContent, message);
      } catch (error) {
        logger.error(`Error al procesar mensaje: ${error}`);
        await this.sendMessage(sender, '❌ Lo siento, ocurrió un error al procesar tu solicitud.');
      }
    }
  }
  
  /**
   * Envía un mensaje de texto a un destinatario
   */
  async sendMessage(to, text) {
    if (!this.isConnected || !this.socket) {
      logger.error('No hay conexión a WhatsApp.');
      return false;
    }
    
    try {
      await this.socket.sendMessage(to, { text });
      return true;
    } catch (error) {
      logger.error(`Error al enviar mensaje: ${error}`);
      return false;
    }
  }
  
  /**
   * Envía un archivo al destinatario
   */
  async sendFile(to, filePath, caption = '') {
    if (!this.isConnected || !this.socket) {
      logger.error('No hay conexión a WhatsApp.');
      return false;
    }
    
    try {
      const buffer = await fs.readFile(filePath);
      const mimetype = this.getMimeType(filePath);
      
      await this.socket.sendMessage(to, {
        document: buffer,
        mimetype,
        fileName: path.basename(filePath),
        caption
      });
      
      return true;
    } catch (error) {
      logger.error(`Error al enviar archivo: ${error}`);
      return false;
    }
  }
  
  /**
   * Obtiene el tipo MIME basado en la extensión del archivo
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

// Exportar instancia singleton
const whatsappService = new WhatsAppService();
module.exports = whatsappService;
