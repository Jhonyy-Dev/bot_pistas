const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const logger = require('../config/logger');
const { updateBotStatus, setWhatsAppServiceRef } = require('../routes/dashboard');

class WhatsAppService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.sessionPath = process.env.SESSION_FOLDER || './sessions';
    
    // Registrar esta instancia en el dashboard
    setWhatsAppServiceRef(this);
  }

  async initialize() {
    try {
      logger.info('Inicializando servicio de WhatsApp...');
      
      // Configurar autenticación multi-archivo
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      
      // Crear socket de WhatsApp
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Deshabilitado para usar dashboard
        logger: logger,
        browser: ['BOT_PISTAS', 'Chrome', '1.0.0']
      });

      // Manejar eventos de conexión
      this.socket.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(update);
      });

      // Manejar credenciales
      this.socket.ev.on('creds.update', saveCreds);

      // Manejar mensajes
      this.socket.ev.on('messages.upsert', async (messageUpdate) => {
        await this.handleMessages(messageUpdate);
      });

      logger.info('Servicio de WhatsApp inicializado correctamente');
      
    } catch (error) {
      logger.error(`Error inicializando WhatsApp: ${error.message}`);
      throw error;
    }
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    
    try {
      if (qr) {
        // Generar QR como imagen base64 para el dashboard
        logger.info('Generando código QR para autenticación...');
        this.qrCode = await QRCode.toDataURL(qr);
        
        // Actualizar estado en dashboard
        updateBotStatus({
          isConnected: false,
          qrCode: this.qrCode,
          lastConnection: new Date().toLocaleString()
        });
        
        logger.info('Código QR generado y enviado al dashboard');
      }

      if (connection === 'close') {
        this.isConnected = false;
        
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.warn(`Conexión cerrada. Razón: ${lastDisconnect?.error?.output?.statusCode}`);
        
        // Actualizar estado en dashboard
        updateBotStatus({
          isConnected: false,
          qrCode: null,
          lastConnection: new Date().toLocaleString()
        });

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          logger.info(`Intentando reconectar... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            this.initialize();
          }, 5000);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          logger.error('Máximo número de intentos de reconexión alcanzado');
        }
      }

      if (connection === 'open') {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.qrCode = null;
        
        logger.info('¡WhatsApp conectado exitosamente!');
        
        // Actualizar estado en dashboard
        updateBotStatus({
          isConnected: true,
          qrCode: null,
          lastConnection: new Date().toLocaleString()
        });
      }
      
    } catch (error) {
      logger.error(`Error en actualización de conexión: ${error.message}`);
    }
  }

  async handleMessages(messageUpdate) {
    try {
      const { messages } = messageUpdate;
      
      for (const message of messages) {
        if (!message.key.fromMe && message.message) {
          const messageController = require('../controllers/messageController');
          await messageController.processMessage(this.socket, message.key.remoteJid, message.message?.conversation || message.message?.extendedTextMessage?.text || "", message);
        }
      }
      
    } catch (error) {
      logger.error(`Error procesando mensajes: ${error.message}`);
    }
  }

  async sendMessage(jid, content) {
    try {
      if (!this.isConnected || !this.socket) {
        throw new Error('WhatsApp no está conectado');
      }
      
      return await this.socket.sendMessage(jid, content);
      
    } catch (error) {
      logger.error(`Error enviando mensaje: ${error.message}`);
      throw error;
    }
  }

  async logout() {
    try {
      if (this.socket) {
        logger.info('Cerrando sesión de WhatsApp...');
        await this.socket.logout();
        this.isConnected = false;
        this.socket = null;
        this.qrCode = null;
        
        // Actualizar estado en dashboard
        updateBotStatus({
          isConnected: false,
          qrCode: null,
          lastConnection: new Date().toLocaleString()
        });
        
        logger.info('Sesión de WhatsApp cerrada correctamente');
      }
    } catch (error) {
      logger.error(`Error cerrando sesión: ${error.message}`);
      throw error;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      qrCode: this.qrCode,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

module.exports = new WhatsAppService();
