/**
 * Script simple para actualizar IDs de Google Drive en la base de datos
 * Este script permite actualizar manualmente los IDs de Google Drive para las canciones
 */
const { Sequelize, Op } = require('sequelize');
const readline = require('readline');

// Configuración de la base de datos
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

// Interfaz para entrada del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Definir el modelo de Canción (ajusta según tu estructura real)
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
  url_externa: Sequelize.STRING,
  usar_url_externa: {
    type: Sequelize.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Canciones', // Ajusta al nombre real de tu tabla
  timestamps: false
});

/**
 * Extrae el ID de Google Drive de una URL
 * @param {string} url URL o ID de Google Drive
 * @returns {string|null} ID extraído o null si no es válido
 */
function extractGoogleDriveId(url) {
  if (!url) return null;
  
  // Si ya es un ID limpio (formato: string de 33 caracteres)
  if (/^[a-zA-Z0-9_-]{33}$/.test(url)) {
    return url;
  }
  
  // Patrones comunes de URLs de Google Drive
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{33})\//, // /file/d/ID/
    /id=([a-zA-Z0-9_-]{33})/, // ?id=ID
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{33})/ // drive.google.com/open?id=ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Busca canciones en la base de datos
 * @param {string} termino Término de búsqueda
 * @returns {Promise<Array>} Lista de canciones
 */
async function buscarCanciones(termino) {
  try {
    const canciones = await Cancion.findAll({
      where: {
        [Op.or]: [
          { nombre: { [Op.like]: `%${termino}%` } },
          { artista: { [Op.like]: `%${termino}%` } }
        ]
      },
      limit: 20
    });
    
    return canciones;
  } catch (error) {
    console.error(`Error al buscar canciones: ${error.message}`);
    return [];
  }
}

/**
 * Actualiza el ID de Google Drive de una canción
 * @param {number} id ID de la canción
 * @param {string} driveId ID de Google Drive
 * @returns {Promise<boolean>} true si se actualizó correctamente
 */
async function actualizarIdDrive(id, driveId) {
  try {
    const cancion = await Cancion.findByPk(id);
    
    if (!cancion) {
      console.log(`❌ No se encontró la canción con ID ${id}`);
      return false;
    }
    
    // Extraer el ID limpio si es una URL
    const idLimpio = extractGoogleDriveId(driveId);
    
    if (!idLimpio) {
      console.log('❌ El ID de Google Drive no es válido');
      return false;
    }
    
    await cancion.update({
      url_externa: idLimpio,
      usar_url_externa: true
    });
    
    console.log(`✅ Canción "${cancion.nombre}" actualizada con ID: ${idLimpio}`);
    return true;
  } catch (error) {
    console.error(`❌ Error al actualizar canción: ${error.message}`);
    return false;
  }
}

/**
 * Muestra canciones sin ID de Google Drive
 * @returns {Promise<Array>} Lista de canciones sin ID
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
      limit: 50
    });
    
    console.log(`\n=== CANCIONES SIN ID DE GOOGLE DRIVE (${canciones.length}) ===`);
    
    if (canciones.length === 0) {
      console.log('¡Todas las canciones tienen ID de Google Drive!');
      return [];
    }
    
    canciones.forEach((cancion, index) => {
      console.log(`${index + 1}. ID: ${cancion.id}, Nombre: ${cancion.nombre}, Artista: ${cancion.artista || 'Desconocido'}`);
    });
    
    return canciones;
  } catch (error) {
    console.error(`❌ Error al buscar canciones sin ID: ${error.message}`);
    return [];
  }
}

/**
 * Función auxiliar para preguntar al usuario
 */
function preguntarUsuario(pregunta) {
  return new Promise((resolve) => {
    rl.question(pregunta, (respuesta) => {
      resolve(respuesta);
    });
  });
}

/**
 * Menú principal
 */
async function menuPrincipal() {
  console.clear();
  console.log("=================================================");
  console.log("  ACTUALIZACIÓN DE IDs DE GOOGLE DRIVE");
  console.log("=================================================");
  console.log("1. Buscar canción por nombre o artista");
  console.log("2. Mostrar canciones sin ID de Google Drive");
  console.log("3. Actualizar ID de Google Drive por ID de canción");
  console.log("4. Salir");
  
  const opcion = await preguntarUsuario("\nSelecciona una opción: ");
  
  switch (opcion) {
    case '1':
      await opcionBuscarCancion();
      break;
    case '2':
      await opcionMostrarSinId();
      break;
    case '3':
      await opcionActualizarPorId();
      break;
    case '4':
      console.log("¡Hasta pronto!");
      rl.close();
      return;
    default:
      console.log("Opción no válida");
      await esperarTecla();
      await menuPrincipal();
  }
}

/**
 * Opción: Buscar canción
 */
async function opcionBuscarCancion() {
  console.clear();
  console.log("=== BUSCAR CANCIÓN ===");
  
  const termino = await preguntarUsuario("Ingresa el nombre o artista a buscar: ");
  
  if (!termino || termino.trim() === '') {
    console.log("❌ Debes ingresar un término de búsqueda");
    await esperarTecla();
    await menuPrincipal();
    return;
  }
  
  const canciones = await buscarCanciones(termino);
  
  if (canciones.length === 0) {
    console.log("❌ No se encontraron canciones con ese término");
    await esperarTecla();
    await menuPrincipal();
    return;
  }
  
  console.log(`\nSe encontraron ${canciones.length} canciones:`);
  canciones.forEach((cancion, index) => {
    const tieneId = cancion.url_externa && cancion.url_externa !== 'No tiene URL externa' && cancion.url_externa !== '';
    console.log(`${index + 1}. ID: ${cancion.id}, Nombre: ${cancion.nombre}, Artista: ${cancion.artista || 'Desconocido'}, Tiene ID: ${tieneId ? '✅' : '❌'}`);
  });
  
  const seleccion = await preguntarUsuario("\n¿Deseas actualizar alguna canción? (Ingresa el número o 0 para volver): ");
  const num = parseInt(seleccion);
  
  if (num > 0 && num <= canciones.length) {
    const cancion = canciones[num - 1];
    const driveId = await preguntarUsuario(`Ingresa el ID o URL de Google Drive para "${cancion.nombre}": `);
    
    if (driveId && driveId.trim() !== '') {
      await actualizarIdDrive(cancion.id, driveId);
    } else {
      console.log("❌ No se ingresó un ID válido");
    }
  }
  
  await esperarTecla();
  await menuPrincipal();
}

/**
 * Opción: Mostrar canciones sin ID
 */
async function opcionMostrarSinId() {
  console.clear();
  const canciones = await mostrarCancionesSinId();
  
  if (canciones.length > 0) {
    const seleccion = await preguntarUsuario("\n¿Deseas actualizar alguna canción? (Ingresa el número o 0 para volver): ");
    const num = parseInt(seleccion);
    
    if (num > 0 && num <= canciones.length) {
      const cancion = canciones[num - 1];
      const driveId = await preguntarUsuario(`Ingresa el ID o URL de Google Drive para "${cancion.nombre}": `);
      
      if (driveId && driveId.trim() !== '') {
        await actualizarIdDrive(cancion.id, driveId);
      } else {
        console.log("❌ No se ingresó un ID válido");
      }
    }
  }
  
  await esperarTecla();
  await menuPrincipal();
}

/**
 * Opción: Actualizar por ID
 */
async function opcionActualizarPorId() {
  console.clear();
  console.log("=== ACTUALIZAR POR ID ===");
  
  const id = await preguntarUsuario("Ingresa el ID de la canción: ");
  const numId = parseInt(id);
  
  if (isNaN(numId) || numId <= 0) {
    console.log("❌ ID no válido");
    await esperarTecla();
    await menuPrincipal();
    return;
  }
  
  const driveId = await preguntarUsuario("Ingresa el ID o URL de Google Drive: ");
  
  if (driveId && driveId.trim() !== '') {
    await actualizarIdDrive(numId, driveId);
  } else {
    console.log("❌ No se ingresó un ID válido");
  }
  
  await esperarTecla();
  await menuPrincipal();
}

/**
 * Función auxiliar para esperar tecla
 */
async function esperarTecla() {
  await preguntarUsuario("\nPresiona Enter para continuar...");
}

/**
 * Función principal
 */
async function main() {
  try {
    // Verificar conexión con la base de datos
    await sequelize.authenticate();
    console.log('✅ Conexión establecida con la base de datos');
    
    // Iniciar menú principal
    await menuPrincipal();
  } catch (error) {
    console.error(`❌ Error de conexión a la base de datos: ${error.message}`);
    rl.close();
  }
}

// Ejecutar el script
main().catch(error => {
  console.error(`Error en la ejecución: ${error.message}`);
  rl.close();
});
