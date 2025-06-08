const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Cancion = sequelize.define('Cancion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  artista: {
    type: DataTypes.STRING(255)
  },
  album: {
    type: DataTypes.STRING(255)
  },
  genero: {
    type: DataTypes.STRING(100)
  },
  duracion: {
    type: DataTypes.STRING(10)
  },
  ruta_archivo: {
    type: DataTypes.STRING(500),
    allowNull: false,
    unique: true
  },
  tamanio_bytes: {
    type: DataTypes.INTEGER
  },
  fecha_subida: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'canciones',
  timestamps: false
});

module.exports = Cancion;
