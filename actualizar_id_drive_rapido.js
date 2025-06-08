/**
 * Script para actualizar rápidamente los IDs de Google Drive de las canciones
 * Este script permite actualizar varias canciones a la vez con sus IDs de Google Drive
 */
const { Sequelize, Op } = require('sequelize');
const fs = require('fs');
const readline = require('readline');

// Definir la conexión con la base de datos
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

// Definir el modelo de Canción para interactuar con la tabla
const Cancion = sequelize.define('Cancion', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: Sequelize.STRING,
  artista: Sequelize.STRING,
  album: Sequelize.STRING,
  genero: Sequelize.STRING,
  duracion: Sequelize.INTEGER,
  ruta_archivo: Sequelize.STRING,
  tamanio_bytes: Sequelize.INTEGER,
  fecha_subida: Sequelize.DATE,
  url_externa: Sequelize.STRING,
  usar_url_externa: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Canciones',
  timestamps: false
});

// Crear una interfaz para leer input del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Lista de canciones y sus IDs de Google Drive
// Formato: [ID_CANCION, "ID_GOOGLE_DRIVE"]
const cancionesParaActualizar = [
  // Ejemplo: [15, "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t"],
  // Añade más canciones según sea necesario
];

/**
 * Actualiza el ID de Google Drive de una canción
 * @param {number} id - ID de la canción a actualizar
 * @param {string} googleDriveId - ID de Google Drive a asignar
 */
async function actualizarIdGoogleDrive(id, googleDriveId) {
  try {
    const cancion = await Cancion.findByPk(id);
    
    if (!cancion) {
      console.log(`❌ Canción con ID ${id} no encontrada`);
      return false;
    }
    
    // Actualizar el ID de Google Drive
    await cancion.update({
      url_externa: googleDriveId,
      usar_url_externa: true
    });
    
    console.log(`✅ Se actualizó correctamente la canción "${cancion.nombre}" con ID de Google Drive: ${googleDriveId}`);
    return true;
  } catch (error) {
    console.log(`❌ Error al actualizar canción ${id}: ${error.message}`);
    return false;
  }
}

/**
 * Valida que un ID de Google Drive tenga formato correcto
 */
function validarIdGoogleDrive(id) {
  const validIdPattern = /^[a-zA-Z0-9_-]{25,44}$/;
  return validIdPattern.test(id);
}

/**
 * Actualiza todas las canciones en la lista cancionesParaActualizar
 */
async function actualizarTodas() {
  console.log(`\n=== ACTUALIZANDO ${cancionesParaActualizar.length} CANCIONES ===\n`);
  
  if (cancionesParaActualizar.length === 0) {
    console.log("❌ No hay canciones para actualizar. Por favor, añade canciones a la lista 'cancionesParaActualizar'.");
    return;
  }
  
  let actualizadas = 0;
  let fallidas = 0;
  
  for (const [idCancion, googleDriveId] of cancionesParaActualizar) {
    // Validar el ID de Google Drive
    if (!validarIdGoogleDrive(googleDriveId)) {
      console.log(`❌ ID de Google Drive inválido para canción ${idCancion}: ${googleDriveId}`);
      fallidas++;
      continue;
    }
    
    const resultado = await actualizarIdGoogleDrive(idCancion, googleDriveId);
    if (resultado) {
      actualizadas++;
    } else {
      fallidas++;
    }
  }
  
  console.log(`\n=== RESUMEN DE ACTUALIZACIÓN ===`);
  console.log(`✅ Canciones actualizadas: ${actualizadas}`);
  console.log(`❌ Canciones fallidas: ${fallidas}`);
  console.log(`Total procesadas: ${actualizadas + fallidas}`);
}

/**
 * Muestra todas las canciones sin ID de Google Drive
 */
async function mostrarCancionesSinId() {
  try {
    const canciones = await Cancion.findAll({
      where: {
        [Op.or]: [
          { url_externa: null },
          { url_externa: '' },
          { url_externa: 'No tiene URL externa' }
        ]
      },
      order: [['id', 'ASC']],
      limit: 100
    });
    
    console.log(`\n=== CANCIONES SIN ID DE GOOGLE DRIVE (Total: ${canciones.length}) ===\n`);
    
    if (canciones.length === 0) {
      console.log("¡Felicidades! Todas las canciones tienen ID de Google Drive.");
      return;
    }
    
    console.log("Formato para actualizar (copia y pega en el script):");
    console.log("const cancionesParaActualizar = [");
    
    canciones.forEach(cancion => {
      console.log(`  // ${cancion.nombre} (${cancion.artista || 'Desconocido'})`);
      console.log(`  [${cancion.id}, "ID_DE_GOOGLE_DRIVE_AQUI"],`);
    });
    
    console.log("];");
    
    console.log("\nInstrucciones:");
    console.log("1. Copia el código generado");
    console.log("2. Reemplaza 'ID_DE_GOOGLE_DRIVE_AQUI' con los IDs reales de Google Drive");
    console.log("3. Pega el código en este script, reemplazando la variable cancionesParaActualizar");
    console.log("4. Ejecuta el script nuevamente");
  } catch (error) {
    console.log(`❌ Error al buscar canciones sin ID: ${error.message}`);
  }
}

// Iniciar el script
console.log("=================================================");
console.log("  ACTUALIZACIÓN RÁPIDA DE IDs DE GOOGLE DRIVE");
console.log("=================================================");

// Verificar la conexión con la base de datos y comenzar
sequelize.authenticate()
  .then(() => {
    console.log("\n✅ Conexión establecida con la base de datos.");
    
    // Si hay canciones para actualizar, actualizarlas
    if (cancionesParaActualizar.length > 0) {
      rl.question("\n¿Quieres actualizar todas las canciones en la lista? (S/N): ", (respuesta) => {
        if (respuesta.toLowerCase() === 's') {
          actualizarTodas().then(() => {
            rl.close();
          });
        } else {
          mostrarCancionesSinId().then(() => {
            rl.close();
          });
        }
      });
    } else {
      // Si no hay canciones para actualizar, mostrar las que necesitan actualización
      mostrarCancionesSinId().then(() => {
        rl.close();
      });
    }
  })
  .catch(error => {
    console.error(`❌ Error al conectar con la base de datos: ${error.message}`);
    rl.close();
    process.exit(1);
  });
