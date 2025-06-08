/**
 * Script para examinar la estructura de la base de datos
 * y actualizar los IDs de Google Drive
 */
const sqlite3 = require('sqlite3').verbose();

// Abrir la base de datos
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error(`Error al abrir la base de datos: ${err.message}`);
    process.exit(1);
  }
  console.log('Conexión establecida con la base de datos SQLite');
});

// Listar todas las tablas en la base de datos
console.log('\n=== TABLAS EN LA BASE DE DATOS ===');
db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, tables) => {
  if (err) {
    console.error(`Error al listar tablas: ${err.message}`);
    return;
  }
  
  console.log('Tablas encontradas:');
  tables.forEach((table) => {
    console.log(`- ${table.name}`);
  });
  
  // Suponiendo que la tabla principal es 'canciones' (o similar)
  // Vamos a buscar la tabla correcta que contiene las canciones
  let tablaCanciones = tables.find(t => 
    t.name.toLowerCase().includes('cancion') || 
    t.name.toLowerCase().includes('song') || 
    t.name.toLowerCase().includes('pista')
  );
  
  if (!tablaCanciones) {
    console.log('\nNo se encontró una tabla de canciones obvia.');
    console.log('Examinando todas las tablas...');
    
    // Verificar cada tabla para encontrar la que parece contener canciones
    let tablesChecked = 0;
    tables.forEach((table) => {
      db.all(`PRAGMA table_info(${table.name})`, [], (err, columns) => {
        tablesChecked++;
        
        if (err) {
          console.error(`Error al obtener columnas para tabla ${table.name}: ${err.message}`);
        } else {
          // Buscar columnas que sugieran que esta es la tabla de canciones
          const relevantColumns = columns.filter(col => 
            col.name.toLowerCase().includes('nombre') ||
            col.name.toLowerCase().includes('artista') ||
            col.name.toLowerCase().includes('title') ||
            col.name.toLowerCase().includes('artist') ||
            col.name.toLowerCase().includes('song') ||
            col.name.toLowerCase().includes('cancion') ||
            col.name.toLowerCase().includes('archivo')
          );
          
          if (relevantColumns.length >= 2) {
            console.log(`\nPosible tabla de canciones: ${table.name}`);
            console.log('Columnas encontradas:');
            columns.forEach(col => {
              console.log(`- ${col.name} (${col.type})`);
            });
            
            // Ver algunos registros de ejemplo
            db.all(`SELECT * FROM "${table.name}" LIMIT 3`, [], (err, rows) => {
              if (err) {
                console.error(`Error al obtener registros de muestra: ${err.message}`);
              } else {
                console.log('\nEjemplos de registros:');
                console.log(JSON.stringify(rows, null, 2));
              }
            });
          }
        }
        
        // Cuando hayamos revisado todas las tablas, cerramos la base de datos
        if (tablesChecked === tables.length) {
          setTimeout(() => {
            db.close((err) => {
              if (err) {
                console.error(`Error al cerrar la base de datos: ${err.message}`);
              }
              console.log('\nConexión con la base de datos cerrada');
            });
          }, 1000); // Pequeño delay para asegurar que todos los resultados se muestren
        }
      });
    });
  } else {
    console.log(`\nTabla de canciones encontrada: ${tablaCanciones.name}`);
    
    // Obtener la estructura de la tabla
    db.all(`PRAGMA table_info(${tablaCanciones.name})`, [], (err, columns) => {
      if (err) {
        console.error(`Error al obtener columnas: ${err.message}`);
        return;
      }
      
      console.log('\nColumnas de la tabla:');
      columns.forEach(col => {
        console.log(`- ${col.name} (${col.type})`);
      });
      
      // Verificar si existe la columna para IDs de Drive
      const columnaURL = columns.find(col => 
        col.name.toLowerCase().includes('url') || 
        col.name.toLowerCase().includes('drive') ||
        col.name.toLowerCase().includes('externa')
      );
      
      if (columnaURL) {
        console.log(`\nColumna para IDs de Google Drive encontrada: ${columnaURL.name}`);
        
        // Ver canciones que necesitan IDs de Drive
        db.all(
          `SELECT * FROM "${tablaCanciones.name}" WHERE "${columnaURL.name}" IS NULL OR "${columnaURL.name}" = '' OR "${columnaURL.name}" = 'No tiene URL externa' LIMIT 10`, 
          [], 
          (err, rows) => {
            if (err) {
              console.error(`Error al buscar canciones sin IDs: ${err.message}`);
            } else {
              console.log(`\nCanciones sin IDs de Google Drive (mostrando hasta 10):`);
              if (rows.length === 0) {
                console.log('¡Todas las canciones tienen IDs de Google Drive!');
              } else {
                rows.forEach(row => {
                  let nombre = row.nombre || row.title || row.filename || 'Desconocido';
                  let artista = row.artista || row.artist || 'Desconocido';
                  let id = row.id || row.ID;
                  console.log(`ID: ${id}, Nombre: ${nombre}, Artista: ${artista}`);
                });
                
                console.log(`\nTotal de canciones sin IDs: ${rows.length}`);
                console.log('\nPara actualizar estos registros, usa el siguiente comando SQL (reemplaza los valores):');
                console.log(`UPDATE "${tablaCanciones.name}" SET "${columnaURL.name}" = 'TU_ID_DE_GOOGLE_DRIVE_AQUI' WHERE id = ID_DE_LA_CANCION;`);
              }
            }
            
            // Cerrar la base de datos
            db.close((err) => {
              if (err) {
                console.error(`Error al cerrar la base de datos: ${err.message}`);
              }
              console.log('\nConexión con la base de datos cerrada');
            });
          }
        );
      } else {
        console.log('\nNo se encontró una columna específica para IDs de Google Drive.');
        console.log('Puedes necesitar añadir esta columna a la tabla.');
        
        // Cerrar la base de datos
        db.close((err) => {
          if (err) {
            console.error(`Error al cerrar la base de datos: ${err.message}`);
          }
          console.log('\nConexión con la base de datos cerrada');
        });
      }
    });
  }
});
