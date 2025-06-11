const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const Usuario = require('./Usuario');

const TransaccionCredito = sequelize.define('TransaccionCredito', {
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
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tipo: {
    type: DataTypes.ENUM('compra', 'uso', 'regalo', 'promocion', 'inicial'),
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING(255)
  },
  fecha_transaccion: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'transacciones_creditos',
  timestamps: false
});

// Asociaciones
TransaccionCredito.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });

module.exports = TransaccionCredito;
