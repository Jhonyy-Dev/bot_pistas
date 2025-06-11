const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// URL exacta del archivo que queremos descargar
const fileUrl = 'https://srv1847-files.hstgr.io/d945b5f3ac94e2ec/files/pistas_frejol/PA%20QUE%20ME%20INVITAN%20-%20LOS%205%20DE%20ORO.MP3';

console.log(`Intentando descargar: ${fileUrl}`);

async function testDownload() {
  try {
    // Intentar descargar el archivo
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'WhatsApp-Bot/1.0'
      }
    });
    
    console.log(`Respuesta recibida con código: ${response.status}`);
    console.log(`Tipo de contenido: ${response.headers['content-type']}`);
    console.log(`Tamaño de respuesta: ${response.data ? response.data.length : 0} bytes`);
    
    // Guardar el archivo localmente para verificar
    const outputPath = path.join(__dirname, 'test_download.mp3');
    await fs.writeFile(outputPath, response.data);
    console.log(`Archivo guardado en: ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error(`Error al descargar: ${error.message}`);
    if (error.response) {
      console.error(`Código de estado: ${error.response.status}`);
      console.error(`Encabezados: ${JSON.stringify(error.response.headers)}`);
    }
    return false;
  }
}

testDownload()
  .then(success => {
    console.log(`Prueba ${success ? 'EXITOSA' : 'FALLIDA'}`);
  });
