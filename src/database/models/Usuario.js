const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero_telefono: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  nombre: {
    type: DataTypes.STRING(100)
  },
  creditos: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  es_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  es_primera_vez: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fecha_registro: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  ultimo_acceso: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'usuarios',
  timestamps: false
});

module.exports = Usuario;
