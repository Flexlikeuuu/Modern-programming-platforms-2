const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;

let socket = null;
let reconnectTimer = null;
let gridState = {};
let offlineQueue = [];
let hoveredCoords = null;
let cooldownInterval = null;

let playerId = sessionStorage.getItem('pixel_player_id');
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  sessionStorage.setItem('pixel_player_id', playerId);
}

const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const onlineCountEl = document.getElementById('online-count');
const bannerEl = document.getElementById('notification-banner');
const gridEl = document.getElementById('grid');
const playerNameInput = document.getElementById('player-name');
const paletteEl = document.getElementById('palette');
const customColorInput = document.getElementById('custom-color');
const queueIndicator = document.getElementById('queue-indicator');
const cooldownTimerEl = document.getElementById('cooldown-timer');
const resetGridBtn = document.getElementById('reset-grid-btn');
const cellHoverInfo = document.getElementById('cell-hover-info');
const leaderboardEl = document.getElementById('leaderboard');
const logListEl = document.getElementById('log-list');

const savedName = sessionStorage.getItem('pixel_player_name');
if (savedName) {
  playerNameInput.value = savedName;
}

let selectedColor = sessionStorage.getItem('pixel_color') || '#e63946';
customColorInput.value = selectedColor;

function initPalette() {
  const swatches = paletteEl.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    if (swatch.dataset.color.toLowerCase() === selectedColor.toLowerCase()) {
      swatch.classList.add('selected');
    } else {
      swatch.classList.remove('selected');
    }

    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedColor = swatch.dataset.color;
      customColorInput.value = selectedColor;
      sessionStorage.setItem('pixel_color', selectedColor);
    });
  });

  customColorInput.addEventListener('input', (e) => {
    selectedColor = e.target.value;
    swatches.forEach(s => s.classList.remove('selected'));
    sessionStorage.setItem('pixel_color', selectedColor);
  });
}

playerNameInput.addEventListener('input', () => {
  sessionStorage.setItem('pixel_player_name', playerNameInput.value.trim() || 'Аноним');
});

function loadLocalQueue() {
  try {
    const raw = localStorage.getItem('pixel_offline_queue');
    if (raw) {
      offlineQueue = JSON.parse(raw);
    }
  } catch (e) {
    offlineQueue = [];
  }
  updateQueueIndicator();
}

function saveLocalQueue() {
  localStorage.setItem('pixel_offline_queue', JSON.stringify(offlineQueue));
  updateQueueIndicator();
}

function updateQueueIndicator() {
  if (offlineQueue.length > 0) {
    queueIndicator.textContent = `Офлайн-очередь: ${offlineQueue.length}`;
    queueIndicator.classList.remove('hidden');
  } else {
    queueIndicator.classList.add('hidden');
  }
}

function getRemainingCooldown() {
  const until = parseInt(sessionStorage.getItem('pixel_cooldown_until') || '0', 10);
  const diff = until - Date.now();
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

function startCooldown(seconds) {
  const until = Date.now() + seconds * 1000;
  sessionStorage.setItem('pixel_cooldown_until', until.toString());
  updateCooldownUI();

  clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    const rem = getRemainingCooldown();
    if (rem <= 0) {
      clearInterval(cooldownInterval);
      sessionStorage.removeItem('pixel_cooldown_until');
      updateCooldownUI();
    } else {
      cooldownTimerEl.textContent = `КД: ${rem}с`;
    }
  }, 500);
}

function updateCooldownUI() {
  const rem = getRemainingCooldown();
  if (rem > 0) {
    cooldownTimerEl.textContent = `КД: ${rem}с`;
    cooldownTimerEl.classList.remove('hidden');
    gridEl.classList.add('on-cooldown');
  } else {
    cooldownTimerEl.classList.add('hidden');
    gridEl.classList.remove('on-cooldown');
  }
}

function checkInitialCooldown() {
  const rem = getRemainingCooldown();
  if (rem > 0) {
    startCooldown(rem);
  }
}

function showBanner(message, type = 'info', timeout = 4000) {
  bannerEl.className = `banner ${type}-banner`;
  bannerEl.textContent = message;
  bannerEl.classList.remove('hidden');

  if (timeout > 0) {
    clearTimeout(bannerEl._timeout);
    bannerEl._timeout = setTimeout(() => {
      bannerEl.classList.add('hidden');
    }, timeout);
  }
}

function hideBanner() {
  bannerEl.classList.add('hidden');
}

function createGridDOM() {
  gridEl.innerHTML = '';
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      cell.addEventListener('mouseenter', () => {
        hoveredCoords = { x, y };
        updateHoverInfo(x, y);
      });

      cell.addEventListener('mouseleave', () => {
        hoveredCoords = null;
        cellHoverInfo.textContent = 'Наведите на ячейку';
      });

      cell.addEventListener('click', () => {
        onCellClicked(x, y);
      });

      gridEl.appendChild(cell);
    }
  }
}

function updateHoverInfo(x, y) {
  const data = gridState[`${x},${y}`];
  if (data && data.owner) {
    cellHoverInfo.textContent = `(${x + 1}, ${y + 1}) - Владелец: ${data.owner} (v${data.version || 0})`;
  } else {
    cellHoverInfo.textContent = `(${x + 1}, ${y + 1}) - Свободна (v0)`;
  }
}

function getCellElement(x, y) {
  return gridEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

function renderCell(x, y, cellData, isPending = false) {
  const el = getCellElement(x, y);
  if (!el) return;

  el.style.backgroundColor = cellData.color || '#ffffff';
  if (isPending) {
    el.classList.add('offline-pending');
  } else {
    el.classList.remove('offline-pending');
  }
}

function renderFullGrid() {
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = gridState[`${x},${y}`] || { color: '#ffffff' };
      renderCell(x, y, cell);
    }
  }

  for (const item of offlineQueue) {
    const el = getCellElement(item.x, item.y);
    if (el) {
      el.style.backgroundColor = item.color;
      el.classList.add('offline-pending');
    }
  }

  if (hoveredCoords) {
    updateHoverInfo(hoveredCoords.x, hoveredCoords.y);
  }
}

function renderLeaderboard(scores = {}) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    leaderboardEl.innerHTML = '<div class="empty-state">Нет данных</div>';
    return;
  }

  leaderboardEl.innerHTML = '';
  entries.forEach(([name, count], index) => {
    const row = document.createElement('div');
    row.className = 'leader-item';
    row.innerHTML = `
      <span class="leader-name">${index + 1}. ${escapeHtml(name)}</span>
      <span class="leader-score">${count} шт.</span>
    `;
    leaderboardEl.appendChild(row);
  });
}

function renderLogs(logs = []) {
  if (logs.length === 0) {
    logListEl.innerHTML = '<div class="empty-state">Нет событий</div>';
    return;
  }

  logListEl.innerHTML = '';
  logs.forEach(item => {
    const el = document.createElement('div');
    el.className = `log-item log-${item.type || 'info'}`;
    el.innerHTML = `<span class="log-time">[${item.time}]</span> ${escapeHtml(item.text)}`;
    logListEl.appendChild(el);
  });
}

function prependLog(item) {
  const empty = logListEl.querySelector('.empty-state');
  if (empty) {
    logListEl.innerHTML = '';
  }
  const el = document.createElement('div');
  el.className = `log-item log-${item.type || 'info'}`;
  el.innerHTML = `<span class="log-time">[${item.time}]</span> ${escapeHtml(item.text)}`;
  logListEl.insertBefore(el, logListEl.firstChild);
  if (logListEl.children.length > 30) {
    logListEl.removeChild(logListEl.lastChild);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function onCellClicked(x, y) {
  const rem = getRemainingCooldown();
  if (rem > 0) {
    showBanner(`Кулдаун активен! Подождите ${rem} сек.`, 'conflict', 2500);
    return;
  }

  const key = `${x},${y}`;
  const cell = gridState[key] || { version: 0 };
  const playerName = playerNameInput.value.trim() || 'Аноним';

  const action = {
    type: 'claim_cell',
    x,
    y,
    color: selectedColor,
    expectedVersion: cell.version || 0,
    playerName,
    playerId
  };

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(action));
  } else {
    offlineQueue.push(action);
    saveLocalQueue();
    startCooldown(30);
    renderCell(x, y, { color: selectedColor }, true);
    showBanner(`Офлайн-режим: действие сохранено в очереди`, 'offline');
  }
}

function connectWebSocket() {
  if (socket) {
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.close();
  }

  statusIndicator.className = 'status-dot connecting';
  statusText.textContent = 'Подключение...';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  socket = new WebSocket(`${protocol}//${host}`);

  socket.onopen = () => {
    statusIndicator.className = 'status-dot online';
    statusText.textContent = 'В сети';

    if (offlineQueue.length > 0) {
      showBanner(`Синхронизация ${offlineQueue.length} офлайн-действий...`, 'info', 0);
      socket.send(JSON.stringify({
        type: 'sync_queue',
        actions: offlineQueue,
        playerId
      }));
    } else {
      hideBanner();
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {}
  };

  socket.onclose = () => {
    statusIndicator.className = 'status-dot offline';
    statusText.textContent = 'Офлайн';
    showBanner('Соединение разорвано. Офлайн-режим. Попытка переподключения...', 'offline', 0);
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket.close();
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 2500);
}

function handleServerMessage(data) {
  if (data.type === 'init') {
    if (!sessionStorage.getItem('pixel_player_name') && data.assignedName) {
      playerNameInput.value = data.assignedName;
      sessionStorage.setItem('pixel_player_name', data.assignedName);
    }

    gridState = data.state.grid || {};
    localStorage.setItem('pixel_cached_grid', JSON.stringify(gridState));
    renderFullGrid();
    renderLeaderboard(data.state.scores);
    renderLogs(data.state.logs);
    if (data.onlineCount !== undefined) {
      onlineCountEl.textContent = `Игроков: ${data.onlineCount}`;
    }
  }

  if (data.type === 'online_count') {
    onlineCountEl.textContent = `Игроков: ${data.onlineCount}`;
  }

  if (data.type === 'cooldown_started') {
    startCooldown(data.seconds || 30);
  }

  if (data.type === 'cooldown_error') {
    startCooldown(data.remaining || 30);
    showBanner(`Кулдаун! Подождите ещё ${data.remaining} сек.`, 'conflict', 3000);
  }

  if (data.type === 'cell_updated') {
    const key = `${data.x},${data.y}`;
    gridState[key] = data.cell;
    localStorage.setItem('pixel_cached_grid', JSON.stringify(gridState));
    renderCell(data.x, data.y, data.cell, false);
    renderLeaderboard(data.scores);
    if (data.log) {
      prependLog(data.log);
    }
    if (hoveredCoords && hoveredCoords.x === data.x && hoveredCoords.y === data.y) {
      updateHoverInfo(data.x, data.y);
    }
  }

  if (data.type === 'conflict') {
    const key = `${data.x},${data.y}`;
    gridState[key] = data.currentCell;
    renderCell(data.x, data.y, data.currentCell, false);

    const el = getCellElement(data.x, data.y);
    if (el) {
      el.classList.add('conflict-flash');
      setTimeout(() => el.classList.remove('conflict-flash'), 800);
    }

    showBanner(data.message || 'Конфликт доступа: элемент был изменен другим пользователем!', 'conflict', 5000);
    if (data.log) {
      prependLog(data.log);
    }
  }

  if (data.type === 'log_entry') {
    if (data.log) {
      prependLog(data.log);
    }
  }

  if (data.type === 'grid_reset') {
    gridState = data.state.grid || {};
    localStorage.setItem('pixel_cached_grid', JSON.stringify(gridState));
    renderFullGrid();
    renderLeaderboard(data.state.scores);
    if (data.log) {
      prependLog(data.log);
    }
    showBanner('Поле было сброшено!', 'info', 3000);
  }

  if (data.type === 'sync_queue_result') {
    gridState = data.state.grid || {};
    localStorage.setItem('pixel_cached_grid', JSON.stringify(gridState));
    offlineQueue = [];
    saveLocalQueue();
    renderFullGrid();
    renderLeaderboard(data.state.scores);
    renderLogs(data.state.logs);

    let conflictCount = 0;
    if (data.results) {
      conflictCount = data.results.filter(r => r.status === 'conflict').length;
    }

    if (conflictCount > 0) {
      showBanner(`Синхронизация завершена: применено ${data.results.length - conflictCount}, конфликтов: ${conflictCount}`, 'conflict', 5000);
    } else {
      showBanner('Все офлайн-действия успешно синхронизированы с сервером!', 'success', 4000);
    }
  }
}

resetGridBtn.addEventListener('click', () => {
  if (confirm('Сбросить состояние всего игрового поля?')) {
    const playerName = playerNameInput.value.trim() || 'Аноним';
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'reset_grid', playerName }));
    }
  }
});

window.addEventListener('online', () => {
  connectWebSocket();
});

window.addEventListener('offline', () => {
  if (socket) {
    socket.close();
  }
});

function initCachedState() {
  try {
    const cached = localStorage.getItem('pixel_cached_grid');
    if (cached) {
      gridState = JSON.parse(cached);
    }
  } catch (e) {}
}

initPalette();
createGridDOM();
initCachedState();
loadLocalQueue();
renderFullGrid();
checkInitialCooldown();
connectWebSocket();
