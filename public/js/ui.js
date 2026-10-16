import { state, getRemainingCooldown, setCooldown, clearCooldown } from './state.js';

let statusIndicator, statusText, onlineCountEl, bannerEl;
let playerNameInput, paletteEl, customColorInput, queueIndicator, cooldownTimerEl;
let leaderboardEl, logListEl;
let userAvatarEl, displayUsernameEl, userScoreBadgeEl, authModalBtn;
let authModal, modalCloseBtn, tabLogin, tabRegister, authForm;
let authUsernameInput, authPasswordInput, authColorGroup, authColorInput, authSubmitBtn, authGuestBtn, authErrorBox;

export function initUI(callbacks) {
  statusIndicator = document.getElementById('status-indicator');
  statusText = document.getElementById('status-text');
  onlineCountEl = document.getElementById('online-count');
  bannerEl = document.getElementById('notification-banner');
  playerNameInput = document.getElementById('player-name');
  paletteEl = document.getElementById('palette');
  customColorInput = document.getElementById('custom-color');
  queueIndicator = document.getElementById('queue-indicator');
  cooldownTimerEl = document.getElementById('cooldown-timer');
  leaderboardEl = document.getElementById('leaderboard');
  logListEl = document.getElementById('log-list');

  userAvatarEl = document.getElementById('user-avatar');
  displayUsernameEl = document.getElementById('display-username');
  userScoreBadgeEl = document.getElementById('user-score-badge');
  authModalBtn = document.getElementById('auth-modal-btn');

  authModal = document.getElementById('auth-modal');
  modalCloseBtn = document.getElementById('modal-close-btn');
  tabLogin = document.getElementById('tab-login');
  tabRegister = document.getElementById('tab-register');
  authForm = document.getElementById('auth-form');
  authUsernameInput = document.getElementById('auth-username');
  authPasswordInput = document.getElementById('auth-password');
  authColorGroup = document.getElementById('auth-color-group');
  authColorInput = document.getElementById('auth-color');
  authSubmitBtn = document.getElementById('auth-submit-btn');
  authGuestBtn = document.getElementById('auth-guest-btn');
  authErrorBox = document.getElementById('auth-error-box');

  customColorInput.value = state.selectedColor;

  initPalette(callbacks.onColorChange);
  initAuthEvents(callbacks.onLogin, callbacks.onRegister, callbacks.onLogout);

  playerNameInput.addEventListener('change', () => {
    if (state.currentUser) return;
    const newName = playerNameInput.value.trim();
    if (!newName) {
      playerNameInput.value = state.currentGuestName || 'Гость';
      showBanner('Имя не может быть пустым!', 'conflict', 3000);
      return;
    }
    callbacks.onChangeName(newName);
  });

  updateUserUI();
  updateQueueIndicator();
  checkInitialCooldown();
}

export function updateConnectionStatus(status, text) {
  if (!statusIndicator || !statusText) return;
  statusIndicator.className = `status-dot ${status}`;
  statusText.textContent = text;
}

export function updateOnlineCount(count) {
  if (onlineCountEl) {
    onlineCountEl.textContent = `Онлайн: ${count}`;
  }
}

export function showBanner(message, type = 'info', timeout = 4000) {
  if (!bannerEl) return;
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

export function hideBanner() {
  if (bannerEl) bannerEl.classList.add('hidden');
}

export function updateQueueIndicator() {
  if (!queueIndicator) return;
  if (state.offlineQueue.length > 0) {
    queueIndicator.textContent = `Офлайн: ${state.offlineQueue.length}`;
    queueIndicator.classList.remove('hidden');
  } else {
    queueIndicator.classList.add('hidden');
  }
}

export function startCooldown(seconds) {
  setCooldown(seconds);
  updateCooldownUI();

  clearInterval(state.cooldownInterval);
  state.cooldownInterval = setInterval(() => {
    const rem = getRemainingCooldown();
    if (rem <= 0) {
      clearInterval(state.cooldownInterval);
      clearCooldown();
      updateCooldownUI();
    } else {
      if (cooldownTimerEl) {
        cooldownTimerEl.textContent = `КД: ${rem}с`;
      }
    }
  }, 500);
}

export function updateCooldownUI() {
  if (!cooldownTimerEl) return;
  const rem = getRemainingCooldown();
  if (rem > 0) {
    cooldownTimerEl.textContent = `КД: ${rem}с`;
    cooldownTimerEl.classList.remove('hidden');
  } else {
    cooldownTimerEl.classList.add('hidden');
  }
}

function checkInitialCooldown() {
  const rem = getRemainingCooldown();
  if (rem > 0) {
    startCooldown(rem);
  }
}

export function updateUserUI() {
  if (!displayUsernameEl) return;
  if (state.currentUser) {
    displayUsernameEl.textContent = state.currentUser.username;
    userScoreBadgeEl.textContent = `Счёт: ${state.currentUser.score || 0}`;
    userAvatarEl.textContent = '👑';
    userAvatarEl.style.backgroundColor = state.currentUser.color || '#3b82f6';
    userAvatarEl.style.color = '#ffffff';
    playerNameInput.value = state.currentUser.username;
    playerNameInput.disabled = true;
    playerNameInput.title = 'Имя аккаунта закреплено';
    authModalBtn.textContent = 'Выйти';
    authModalBtn.className = 'btn btn-outline';
  } else {
    const guest = state.currentGuestName || playerNameInput.value.trim() || 'Гость';
    displayUsernameEl.textContent = guest;
    userScoreBadgeEl.textContent = 'Гостевой режим';
    userAvatarEl.textContent = '👤';
    userAvatarEl.style.backgroundColor = '#e2e8f0';
    userAvatarEl.style.color = '#1e293b';
    playerNameInput.disabled = false;
    playerNameInput.title = 'Смена гостевого имени';
    authModalBtn.textContent = 'Войти';
    authModalBtn.className = 'btn btn-primary';
  }
}

export function renderLeaderboard(scores = {}) {
  if (!leaderboardEl) return;
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
      <span class="leader-score">${count} пикс.</span>
    `;
    leaderboardEl.appendChild(row);
  });
}

export function renderLogs(logs = []) {
  if (!logListEl) return;
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

export function prependLog(item) {
  if (!logListEl) return;
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

function initPalette(onColorChange) {
  const swatches = paletteEl.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    if (swatch.dataset.color.toLowerCase() === state.selectedColor.toLowerCase()) {
      swatch.classList.add('selected');
    } else {
      swatch.classList.remove('selected');
    }

    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      state.selectedColor = swatch.dataset.color;
      customColorInput.value = state.selectedColor;
      sessionStorage.setItem('pixel_color', state.selectedColor);
      onColorChange(state.selectedColor);
    });
  });

  customColorInput.addEventListener('input', (e) => {
    state.selectedColor = e.target.value;
    swatches.forEach(s => s.classList.remove('selected'));
    sessionStorage.setItem('pixel_color', state.selectedColor);
    onColorChange(state.selectedColor);
  });
}

function initAuthEvents(onLogin, onRegister, onLogout) {
  authModalBtn.addEventListener('click', () => {
    if (state.currentUser) {
      if (confirm('Выйти из текущего аккаунта?')) {
        onLogout();
      }
    } else {
      openAuthModal('login');
    }
  });

  modalCloseBtn.addEventListener('click', closeAuthModal);
  authGuestBtn.addEventListener('click', closeAuthModal);

  tabLogin.addEventListener('click', () => switchAuthTab('login'));
  tabRegister.addEventListener('click', () => switchAuthTab('register'));

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;
    const isReg = tabRegister.classList.contains('active');

    if (!username || !password) {
      showAuthError('Заполните все поля');
      return;
    }

    authErrorBox.classList.add('hidden');

    if (isReg) {
      const color = authColorInput.value;
      onRegister(username, password, color);
    } else {
      onLogin(username, password);
    }
  });
}

export function openAuthModal(mode = 'login') {
  authModal.classList.remove('hidden');
  authErrorBox.classList.add('hidden');
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  switchAuthTab(mode);
}

export function closeAuthModal() {
  authModal.classList.add('hidden');
}

export function switchAuthTab(mode) {
  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    authColorGroup.classList.add('hidden');
    authSubmitBtn.textContent = 'Войти';
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    authColorGroup.classList.remove('hidden');
    authSubmitBtn.textContent = 'Зарегистрироваться';
  }
}

export function showAuthError(message) {
  authErrorBox.textContent = message;
  authErrorBox.classList.remove('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

