import { state, loadOfflineQueue, loadCachedGrid, saveOfflineQueue, getRemainingCooldown } from './state.js';
import { initCanvas, renderCanvas, resetViewport, zoomIn, zoomOut } from './canvas.js';
import * as UI from './ui.js';
import { connectWebSocket, sendSocketMessage } from './socket.js';
import { DEFAULT_COOLDOWN_SECONDS } from './config.js';

function handleCellClick(x, y) {
  const rem = getRemainingCooldown();
  if (rem > 0) {
    UI.showBanner(`Кулдаун активен! Подождите ${rem} сек.`, 'conflict', 2500);
    return;
  }

  const key = `${x},${y}`;
  const cell = state.gridState[key] || { version: 0 };
  const effectivePlayerName = state.currentUser
    ? state.currentUser.username
    : (state.currentGuestName || 'Гость');

  const action = {
    type: 'claim_cell',
    x,
    y,
    color: state.selectedColor,
    expectedVersion: cell.version || 0,
    playerName: effectivePlayerName,
    playerId: state.playerId
  };

  const sent = sendSocketMessage(action);
  if (!sent) {
    const existingIndex = state.offlineQueue.findIndex(a => a.x === x && a.y === y);
    if (existingIndex !== -1) {
      state.offlineQueue[existingIndex] = action;
    } else {
      state.offlineQueue.push(action);
    }
    saveOfflineQueue();
    UI.updateQueueIndicator();
    UI.startCooldown(DEFAULT_COOLDOWN_SECONDS);
    renderCanvas();
    UI.showBanner(`Офлайн-режим: действие сохранено в очереди (${x + 1}, ${y + 1})`, 'offline');
  }
}

function handleLogin(username, password) {
  sendSocketMessage({
    type: 'auth_login',
    username,
    password
  });
}

function handleRegister(username, password, color) {
  sendSocketMessage({
    type: 'auth_register',
    username,
    password,
    color
  });
}

function handleLogout() {
  sendSocketMessage({
    type: 'auth_logout',
    token: state.authToken
  });
  localStorage.removeItem('pixel_auth_token');
  state.authToken = null;
  state.currentUser = null;
  UI.updateUserUI();
  UI.showBanner('Вы вышли из аккаунта. Включен гостевой режим.', 'info', 3000);
}

function handleChangeName(newName) {
  const sent = sendSocketMessage({
    type: 'change_name',
    requestedName: newName
  });
  if (!sent) {
    state.currentGuestName = newName;
    sessionStorage.setItem('pixel_guest_name', newName);
    UI.updateUserUI();
  }
}

function handleColorChange(color) {
  if (state.currentUser) {
    sendSocketMessage({
      type: 'update_profile_color',
      color
    });
  }
}

function init() {
  loadOfflineQueue();
  loadCachedGrid();

  initCanvas(handleCellClick);

  document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
  document.getElementById('btn-zoom-reset')?.addEventListener('click', resetViewport);

  document.getElementById('reset-grid-btn')?.addEventListener('click', () => {
    if (confirm('Сбросить всё игровое поле 100x100?')) {
      const playerName = state.currentUser ? state.currentUser.username : (state.currentGuestName || 'Игрок');
      sendSocketMessage({ type: 'reset_grid', playerName });
    }
  });

  UI.initUI({
    onLogin: handleLogin,
    onRegister: handleRegister,
    onLogout: handleLogout,
    onChangeName: handleChangeName,
    onColorChange: handleColorChange
  });

  window.addEventListener('online', connectWebSocket);
  window.addEventListener('offline', () => {
    if (state.socket) state.socket.close();
  });

  connectWebSocket();
}

window.addEventListener('DOMContentLoaded', init);

