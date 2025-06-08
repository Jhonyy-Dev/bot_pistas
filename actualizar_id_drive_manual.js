/**
 * Script para actualizar manualmente los IDs de Google Drive de las canciones
 * Este script permite actualizar una canción específica con su ID de Google Drive
 */
const { Sequelize, Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const logger = require('./src/config/logger');

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

// Funciones auxiliares

/**
 * Busca canciones en la base de datos por nombre o ID
 * @param {string} termino - Término a buscar o ID
 */
async function buscarCanciones(termino) {
  try {
    // Si es un número, buscar por ID
    if (!isNaN(termino) && termino.trim() !== '') {
      const cancion = await Cancion.findByPk(parseInt(termino.trim()));
      return cancion ? [cancion] : [];
    }
    
    // Si no es un número, buscar por nombre o artista
    const canciones = await Cancion.findAll({
      where: {
        [Op.or]: [
          { nombre: { [Op.like]: `%${termino}%` } },
          { artista: { [Op.like]: `%${termino}%` } },
          { ruta_archivo: { [Op.like]: `%${termino}%` } }
        ]
      },
      limit: 10
    });
    
    return canciones;
  } catch (error) {
    logger.error(`Error al buscar canciones: ${error.message}`);
    return [];
  }
}

/**
 * Actualiza el ID de Google Drive de una canción
 * @param {number} id - ID de la canción a actualizar
 * @param {string} googleDriveId - ID de Google Drive a asignar
 */
async function actualizarIdGoogleDrive(id, googleDriveId) {
  try {
    const cancion = await Cancion.findByPk(id);
    
    if (!cancion) {
      logger.error(`Canción con ID ${id} no encontrada`);
      return false;
    }
    
    // Actualizar el ID de Google Drive
    await cancion.update({
      url_externa: googleDriveId,
      usar_url_externa: true
    });
    
    logger.info(`Se actualizó correctamente la canción "${cancion.nombre}" con ID de Google Drive: ${googleDriveId}`);
    return true;
  } catch (error) {
    logger.error(`Error al actualizar canción: ${error.message}`);
    return false;
  }
}

/**
 * Muestra una lista de canciones con formato
 * @param {Array} canciones - Lista de canciones a mostrar
 */
function mostrarCanciones(canciones) {
  console.log("\n=== CANCIONES ENCONTRADAS ===");
  if (canciones.length === 0) {
    console.log("No se encontraron canciones");
    return;
  }
  
  canciones.forEach(cancion => {
    console.log(`ID: ${cancion.id}`);
    console.log(`Nombre: ${cancion.nombre}`);
    console.log(`Artista: ${cancion.artista || 'Desconocido'}`);
    console.log(`URL Drive: ${cancion.url_externa || 'Sin ID de Google Drive'}`);
    console.log('------------------------');
  });
}

/**
 * Valida que un ID de Google Drive tenga formato correcto
 * @param {string} id - ID a validar
 * @returns {boolean} - true si el ID tiene formato válido
 */
function validarIdGoogleDrive(id) {
  // Los IDs de Drive generalmente tienen entre 25 y 44 caracteres
  // y contienen letras, números, guiones y guiones bajos
  const validIdPattern = /^[a-zA-Z0-9_-]{25,44}$/;
  return validIdPattern.test(id);
}

/**
 * Menú principal del script
 */
async function menuPrincipal() {
  console.log("\n===== ACTUALIZACIÓN DE IDs DE GOOGLE DRIVE =====");
  console.log("1. Buscar canción por nombre o artista");
  console.log("2. Actualizar canción por ID");
  console.log("3. Mostrar canciones sin ID de Google Drive");
  console.log("4. Salir");
  
  rl.question("\nSelecciona una opción: ", async (opcion) => {
    switch (opcion) {
      case '1':
        await menuBuscarCancion();
        break;
      case '2':
        await menuActualizarCancion();
        break;
      case '3':
        await mostrarCancionesSinId();
        break;
      case '4':
        console.log("¡Hasta luego!");
        rl.close();
        process.exit(0);
        break;
      default:
        console.log("Opción no válida. Intenta nuevamente.");
        menuPrincipal();
    }
  });
}

/**
 * Menú para buscar canciones
 */
async function menuBuscarCancion() {
  rl.question("\nIngresa el nombre, artista o ID de la canción: ", async (termino) => {
    const canciones = await buscarCanciones(termino);
    mostrarCanciones(canciones);
    
    if (canciones.length > 0) {
      rl.question("\n¿Quieres actualizar alguna de estas canciones? (S/N): ", (respuesta) => {
        if (respuesta.toLowerCase() === 's') {
          rl.question("Ingresa el ID de la canción a actualizar: ", (idCancion) => {
            const cancionSeleccionada = canciones.find(c => c.id == idCancion);
            if (cancionSeleccionada) {
              rl.question(`Ingresa el ID de Google Drive para "${cancionSeleccionada.nombre}": `, async (googleDriveId) => {
                if (validarIdGoogleDrive(googleDriveId)) {
                  await actualizarIdGoogleDrive(idCancion, googleDriveId);
                } else {
                  console.log("❌ El ID de Google Drive no tiene un formato válido. Debe tener entre 25 y 44 caracteres y contener solo letras, números, guiones y guiones bajos.");
                }
                menuPrincipal();
              });
            } else {
              console.log("ID de canción no válido.");
              menuPrincipal();
            }
          });
        } else {
          menuPrincipal();
        }
      });
    } else {
      rl.question("\nPresiona ENTER para volver al menú principal", () => {
        menuPrincipal();
      });
    }
  });
}

/**
 * Menú para actualizar una canción directamente por ID
 */
async function menuActualizarCancion() {
  rl.question("\nIngresa el ID de la canción: ", (idCancion) => {
    if (isNaN(idCancion) || idCancion.trim() === '') {
      console.log("❌ ID no válido. Debe ser un número.");
      menuPrincipal();
      return;
    }
    
    Cancion.findByPk(parseInt(idCancion.trim()))
      .then(cancion => {
        if (!cancion) {
          console.log(`❌ No se encontró ninguna canción con ID: ${idCancion}`);
          menuPrincipal();
          return;
        }
        
        console.log(`\nCanción encontrada: "${cancion.nombre}" (${cancion.artista || 'Artista desconocido'})`);
        console.log(`URL actual: ${cancion.url_externa || 'Sin ID de Google Drive'}`);
        
        rl.question("\nIngresa el nuevo ID de Google Drive: ", async (googleDriveId) => {
          if (validarIdGoogleDrive(googleDriveId)) {
            await actualizarIdGoogleDrive(idCancion, googleDriveId);
          } else {
            console.log("❌ El ID de Google Drive no tiene un formato válido. Debe tener entre 25 y 44 caracteres y contener solo letras, números, guiones y guiones bajos.");
          }
          menuPrincipal();
        });
      })
      .catch(error => {
        console.log(`❌ Error al buscar la canción: ${error.message}`);
        menuPrincipal();
      });
  });
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
      limit: 20
    });
    
    console.log(`\n===== CANCIONES SIN ID DE GOOGLE DRIVE (Mostrando ${canciones.length}) =====`);
    
    if (canciones.length === 0) {
      console.log("¡Felicidades! Todas las canciones tienen ID de Google Drive.");
      rl.question("\nPresiona ENTER para volver al menú principal", () => {
        menuPrincipal();
      });
      return;
    }
    
    canciones.forEach(cancion => {
      console.log(`ID: ${cancion.id} | Nombre: ${cancion.nombre} | Artista: ${cancion.artista || 'Desconocido'}`);
    });
    
    rl.question("\n¿Quieres actualizar alguna de estas canciones? (S/N): ", (respuesta) => {
      if (respuesta.toLowerCase() === 's') {
        rl.question("Ingresa el ID de la canción a actualizar: ", (idCancion) => {
          const cancionSeleccionada = canciones.find(c => c.id == idCancion);
          if (cancionSeleccionada) {
            rl.question(`Ingresa el ID de Google Drive para "${cancionSeleccionada.nombre}": `, async (googleDriveId) => {
              if (validarIdGoogleDrive(googleDriveId)) {
                await actualizarIdGoogleDrive(idCancion, googleDriveId);
              } else {
                console.log("❌ El ID de Google Drive no tiene un formato válido.");
              }
              menuPrincipal();
            });
          } else {
            console.log("ID de canción no válido.");
            menuPrincipal();
          }
        });
      } else {
        menuPrincipal();
      }
    });
  } catch (error) {
    console.log(`❌ Error al buscar canciones sin ID: ${error.message}`);
    menuPrincipal();
  }
}

// Iniciar el script
console.log("=================================================");
console.log("  ACTUALIZACIÓN DE IDs DE GOOGLE DRIVE MANUAL");
console.log("=================================================");
console.log("\nEste script te permite actualizar las canciones con sus IDs de Google Drive.");
console.log("Para cada canción, necesitarás el ID de Google Drive correspondiente.");
console.log("\nCómo obtener un ID de Google Drive:");
console.log("1. Abre tu archivo en Google Drive");
console.log("2. Copia el ID de la URL del navegador");
console.log("   Ejemplo: https://drive.google.com/file/d/ESTE-ES-EL-ID-QUE-NECESITAS/view");
console.log("\nIMPORTANTE: Solo debes agregar el ID, no la URL completa.");

// Verificar la conexión con la base de datos y comenzar
sequelize.authenticate()
  .then(() => {
    console.log("\n✅ Conexión establecida con la base de datos.");
    menuPrincipal();
  })
  .catch(error => {
    console.error(`❌ Error al conectar con la base de datos: ${error.message}`);
    process.exit(1);
  });
