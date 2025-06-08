const Usuario = require('./Usuario');
const Cancion = require('./Cancion');
const Descarga = require('./Descarga');
const TransaccionCredito = require('./TransaccionCredito');

// Definir asociaciones adicionales entre modelos
Usuario.hasMany(Descarga, { foreignKey: 'id_usuario', as: 'descargas' });
Cancion.hasMany(Descarga, { foreignKey: 'id_cancion', as: 'descargas' });
Usuario.hasMany(TransaccionCredito, { foreignKey: 'id_usuario', as: 'transacciones' });

module.exports = {
  Usuario,
  Cancion,
  Descarga,
  TransaccionCredito
};
