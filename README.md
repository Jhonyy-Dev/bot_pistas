# Bot_Chiveros_Perú

Bot de WhatsApp para búsqueda y envío de canciones MP3 con sistema de créditos.

## Descripción

Este bot permite a los usuarios buscar y descargar canciones en formato MP3 utilizando un sistema de créditos. Cada usuario debe tener créditos para poder descargar una canción (1 crédito por canción).

## Características

- Conexión a WhatsApp sin necesidad de API oficial (usando Baileys)
- Autenticación mediante código QR
- Búsqueda de canciones por nombre, artista o álbum
- Sistema de créditos para descargas
- Base de datos MySQL con Sequelize
- Registro completo de descargas y transacciones

## Instalación

1. Clonar el repositorio
2. Instalar dependencias con `npm install`
3. Configurar variables de entorno en el archivo `.env`
4. Inicializar la base de datos MySQL con el script proporcionado
5. Ejecutar la aplicación con `npm start`

## Uso

1. Al iniciar por primera vez, se mostrará un código QR
2. Escanea el código QR con WhatsApp desde tu teléfono
3. Una vez conectado, los usuarios pueden enviar mensajes al número vinculado
4. Para buscar una canción, los usuarios deben enviar el nombre o artista
5. El bot responderá con resultados coincidentes
6. Los usuarios pueden seleccionar una canción para descargar si tienen créditos disponibles

## Comandos del Bot

- `!ayuda` - Muestra información de ayuda
- `!creditos` - Muestra los créditos disponibles
- `!buscar [término]` - Busca canciones que coincidan con el término

## Estructura del Proyecto

```
📂 Bot_Chiveros_Peru/
├── 📂 src/                    - Código fuente
│   ├── 📂 config/             - Configuración de la app
│   ├── 📂 controllers/        - Controladores de lógica de negocio
│   ├── 📂 database/           - Modelos de Sequelize
│   ├── 📂 middlewares/        - Middlewares del sistema
│   ├── 📂 services/           - Servicios externos (WhatsApp)
│   └── 📂 utils/              - Utilidades y helpers
├── 📂 mp3/                    - Directorio para archivos MP3
├── 📂 sessions/               - Datos de sesión de WhatsApp
├── 📄 .env                    - Variables de entorno
├── 📄 package.json            - Dependencias
└── 📄 README.md               - Este archivo
```

## Licencia

MIT
