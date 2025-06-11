const fs = require('fs-extra');
const path = require('path');

// Ruta donde guardaremos el archivo MP3 de ejemplo
const outputPath = path.join(__dirname, 'src', 'assets', 'mp3', 'PA QUE ME INVITAN - LOS 5 DE ORO.MP3');

// Crear un buffer con datos mínimos para un archivo MP3 válido
// Este es un encabezado MP3 básico que creará un archivo MP3 vacío pero válido
const mp3Header = Buffer.from([
  0xFF, 0xFB, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

async function createDummyMp3() {
  try {
    // Asegurarse de que el directorio existe
    await fs.ensureDir(path.dirname(outputPath));
    
    // Escribir el archivo MP3 de ejemplo
    await fs.writeFile(outputPath, mp3Header);
    
    console.log(`Archivo MP3 de ejemplo creado en: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`Error al crear el archivo MP3: ${error.message}`);
    return false;
  }
}

createDummyMp3()
  .then(success => {
    console.log(`Operación ${success ? 'exitosa' : 'fallida'}`);
  });
