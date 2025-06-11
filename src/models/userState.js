/**
 * Módulo para manejar el estado de los usuarios
 * Permite gestionar créditos, estados de conversación y otras propiedades de usuario
 */

// Almacena el estado de los usuarios en memoria
const userStates = new Map();

/**
 * Inicializa el estado de un usuario
 * @param {string} userId - ID del usuario
 */
function initUser(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      credits: 0,
      awaitingSongSelection: false,
      songMatches: null,
      selectedSong: null,
      step: 'inicio',
      lastActivity: Date.now()
    });
  }
}

/**
 * Obtiene el estado de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Object|null} - Estado del usuario o null si no existe
 */
function getState(userId) {
  return userStates.get(userId) || null;
}

/**
 * Establece el estado de un usuario
 * @param {string} userId - ID del usuario
 * @param {Object} state - Nuevo estado
 */
function setState(userId, state) {
  userStates.set(userId, state);
}

/**
 * Establece los créditos de un usuario
 * @param {string} userId - ID del usuario
 * @param {number} credits - Cantidad de créditos
 */
function setCredits(userId, credits) {
  if (!userStates.has(userId)) {
    initUser(userId);
  }
  const state = userStates.get(userId);
  state.credits = credits;
  userStates.set(userId, state);
}

/**
 * Obtiene los créditos de un usuario
 * @param {string} userId - ID del usuario
 * @returns {number} - Cantidad de créditos o 0 si el usuario no existe
 */
function getCredits(userId) {
  if (!userStates.has(userId)) {
    return 0;
  }
  return userStates.get(userId).credits || 0;
}

/**
 * Decrementa los créditos de un usuario
 * @param {string} userId - ID del usuario
 * @param {number} amount - Cantidad a decrementar (por defecto 1)
 * @returns {boolean} - true si se pudo decrementar, false si no hay suficientes créditos
 */
function decrementCredits(userId, amount = 1) {
  if (!userStates.has(userId)) {
    return false;
  }
  
  const state = userStates.get(userId);
  if (state.credits < amount) {
    return false;
  }
  
  state.credits -= amount;
  userStates.set(userId, state);
  return true;
}

/**
 * Limpia el estado de un usuario
 * @param {string} userId - ID del usuario
 */
function clearState(userId) {
  userStates.delete(userId);
}

/**
 * Limpia los estados inactivos
 * @param {number} maxInactiveTime - Tiempo máximo de inactividad en milisegundos
 */
function cleanupInactiveStates(maxInactiveTime = 30 * 60 * 1000) { // 30 minutos por defecto
  const now = Date.now();
  for (const [userId, state] of userStates.entries()) {
    if (now - state.lastActivity > maxInactiveTime) {
      userStates.delete(userId);
    }
  }
}

module.exports = {
  initUser,
  getState,
  setState,
  setCredits,
  getCredits,
  decrementCredits,
  clearState,
  cleanupInactiveStates
};
