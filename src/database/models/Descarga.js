const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const Usuario = require('./Usuario');
const Cancion = require('./Cancion');

const Descarga = sequelize.define('Descarga', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Usuario,
      key: 'id'
    }
  },
  id_cancion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Cancion,
      key: 'id'
    }
  },
  fecha_descarga: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  origen: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'local'
  }
}, {
  tableName: 'descargas',
  timestamps: false
});

// Asociaciones
Descarga.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });
Descarga.belongsTo(Cancion, { foreignKey: 'id_cancion', as: 'cancion' });

module.exports = Descarga;
