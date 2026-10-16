import { state, saveOfflineQueue, saveCachedGrid } from './state.js';
import { renderCanvas } from './canvas.js';
import * as UI from './ui.js';
import { DEFAULT_COOLDOWN_SECONDS } from './config.js';

let reconnectTimer = null;

export function connectWebSocket() {
  if (state.socket) {
    state.socket.onopen = null;
    state.socket.onclose = null;
    state.socket.onerror = null;
    state.socket.onmessage = null;
    state.socket.close();
  }

  UI.updateConnectionStatus('connecting', 'Подключение...');

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  state.socket = new WebSocket(`${protocol}//${host}`);

  state.socket.onopen = () => {
    UI.updateConnectionStatus('online', 'В сети');

    state.socket.send(JSON.stringify({
      type: 'init_player',
      playerId: state.playerId,
      token: state.authToken,
      requestedName: state.currentGuestName || null
    }));

    if (state.offlineQueue.length > 0) {
      UI.showBanner(`Синхронизация ${state.offlineQueue.length} офлайн-действий...`, 'info', 0);
      state.socket.send(JSON.stringify({
        type: 'sync_queue',
        actions: state.offlineQueue,
        playerId: state.playerId
      }));
    } else {
      UI.hideBanner();
    }
  };

  state.socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {}
  };

  state.socket.onclose = () => {
    UI.updateConnectionStatus('offline', 'Офлайн');
    UI.showBanner('Соединение разорвано. Офлайн-режим. Попытка переподключения...', 'offline', 0);
    scheduleReconnect();
  };

  state.socket.onerror = () => {
    state.socket.close();
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 2500);
}

export function sendSocketMessage(data) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

function handleServerMessage(data) {
  if (data.type === 'init') {
    if (data.claimedCells && Array.isArray(data.claimedCells)) {
      state.gridState = {};
      data.claimedCells.forEach(c => {
        state.gridState[`${c.x},${c.y}`] = c;
      });
      saveCachedGrid();
    }

    if (data.assignedName && !state.currentUser) {
      state.currentGuestName = data.assignedName;
      sessionStorage.setItem('pixel_guest_name', data.assignedName);
      UI.updateUserUI();
    }

    UI.renderLeaderboard(data.scores);
    UI.renderLogs(data.logs);
    renderCanvas();

    if (data.onlineCount !== undefined) {
      UI.updateOnlineCount(data.onlineCount);
    }
  }

  if (data.type === 'auth_success') {
    state.authToken = data.token;
    localStorage.setItem('pixel_auth_token', state.authToken);
    state.currentUser = data.user;
    UI.updateUserUI();
    UI.closeAuthModal();

    if (state.currentUser.color) {
      state.selectedColor = state.currentUser.color;
      sessionStorage.setItem('pixel_color', state.selectedColor);
      const colorInput = document.getElementById('custom-color');
      if (colorInput) colorInput.value = state.selectedColor;
    }

    if (!data.silent) {
      UI.showBanner(data.message || `Успешный вход: ${state.currentUser.username}`, 'success', 3500);
    }
  }

  if (data.type === 'auth_error') {
    UI.showAuthError(data.message || 'Ошибка авторизации');
  }

  if (data.type === 'auth_invalid') {
    localStorage.removeItem('pixel_auth_token');
    state.authToken = null;
    state.currentUser = null;
    UI.updateUserUI();
  }

  if (data.type === 'auth_logged_out') {
    state.currentUser = null;
    state.authToken = null;
    localStorage.removeItem('pixel_auth_token');
    state.currentGuestName = data.guestName || 'Гость';
    sessionStorage.setItem('pixel_guest_name', state.currentGuestName);
    UI.updateUserUI();
  }

  if (data.type === 'name_assigned') {
    state.currentGuestName = data.playerName;
    sessionStorage.setItem('pixel_guest_name', data.playerName);
    UI.updateUserUI();
    if (data.wasConflict && data.message) {
      UI.showBanner(data.message, 'conflict', 4000);
    }
  }

  if (data.type === 'name_success') {
    state.currentGuestName = data.playerName;
    sessionStorage.setItem('pixel_guest_name', data.playerName);
    UI.updateUserUI();
    UI.showBanner(data.message || `Имя изменено на "${data.playerName}"`, 'success', 3000);
  }

  if (data.type === 'name_error') {
    if (data.currentName) {
      state.currentGuestName = data.currentName;
      sessionStorage.setItem('pixel_guest_name', data.currentName);
      UI.updateUserUI();
    }
    UI.showBanner(data.message || 'Имя занято!', 'conflict', 4000);
  }

  if (data.type === 'online_count') {
    UI.updateOnlineCount(data.onlineCount);
  }

  if (data.type === 'cooldown_started') {
    UI.startCooldown(data.seconds || DEFAULT_COOLDOWN_SECONDS);
  }

  if (data.type === 'cooldown_error') {
    UI.startCooldown(data.remaining || DEFAULT_COOLDOWN_SECONDS);
    UI.showBanner(`Кулдаун! Подождите ещё ${data.remaining} сек.`, 'conflict', 3000);
  }

  if (data.type === 'cell_updated') {
    const key = `${data.x},${data.y}`;
    state.gridState[key] = data.cell;
    saveCachedGrid();
    renderCanvas();
    UI.renderLeaderboard(data.scores);

    if (state.currentUser && data.cell.owner && data.cell.owner.toLowerCase() === state.currentUser.username.toLowerCase()) {
      state.currentUser.score = (state.currentUser.score || 0) + 1;
      UI.updateUserUI();
    }

    if (data.log) {
      UI.prependLog(data.log);
    }
  }

  if (data.type === 'conflict') {
    const key = `${data.x},${data.y}`;
    state.gridState[key] = data.currentCell;
    state.conflictFlashCells.set(key, Date.now());
    renderCanvas();

    UI.showBanner(data.message || 'Конфликт доступа: пиксель уже занят другим игроком!', 'conflict', 5000);
    if (data.log) {
      UI.prependLog(data.log);
    }
  }

  if (data.type === 'log_entry') {
    if (data.log) {
      UI.prependLog(data.log);
    }
  }

  if (data.type === 'grid_reset') {
    state.gridState = {};
    saveCachedGrid();
    if (state.currentUser) {
      state.currentUser.score = 0;
      UI.updateUserUI();
    }
    renderCanvas();
    UI.renderLeaderboard(data.scores || {});
    if (data.log) {
      UI.prependLog(data.log);
    }
    UI.showBanner('Поле 100x100 было сброшено!', 'info', 3000);
  }

  if (data.type === 'sync_queue_result') {
    state.offlineQueue = [];
    saveOfflineQueue();
    UI.updateQueueIndicator();
    renderCanvas();
    UI.renderLeaderboard(data.scores);
    UI.renderLogs(data.logs);

    let conflictCount = 0;
    if (data.results) {
      conflictCount = data.results.filter(r => r.status === 'conflict').length;
    }

    if (conflictCount > 0) {
      UI.showBanner(`Синхронизация: применено ${data.results.length - conflictCount}, конфликтов: ${conflictCount}`, 'conflict', 5000);
    } else {
      UI.showBanner('Все офлайн-действия успешно синхронизированы с БД!', 'success', 4000);
    }
  }
}

