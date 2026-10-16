export const state = {
  gridState: {},
  offlineQueue: [],
  authToken: localStorage.getItem('pixel_auth_token') || null,
  currentUser: null,
  currentGuestName: sessionStorage.getItem('pixel_guest_name') || '',
  selectedColor: sessionStorage.getItem('pixel_color') || '#e63946',
  playerId: getOrCreatePlayerId(),
  cooldownInterval: null,
  socket: null,
  conflictFlashCells: new Map(),
  hoveredCell: null
};

function getOrCreatePlayerId() {
  let pid = sessionStorage.getItem('pixel_player_id');
  if (!pid) {
    pid = 'p_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    sessionStorage.setItem('pixel_player_id', pid);
  }
  return pid;
}

export function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem('pixel_offline_queue_100');
    state.offlineQueue = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.offlineQueue = [];
  }
}

export function saveOfflineQueue() {
  localStorage.setItem('pixel_offline_queue_100', JSON.stringify(state.offlineQueue));
}

export function loadCachedGrid() {
  try {
    const cached = localStorage.getItem('pixel_cached_grid_100');
    if (cached) {
      state.gridState = JSON.parse(cached);
    }
  } catch (e) {}
}

export function saveCachedGrid() {
  localStorage.setItem('pixel_cached_grid_100', JSON.stringify(state.gridState));
}

export function getRemainingCooldown() {
  const until = parseInt(sessionStorage.getItem('pixel_cooldown_until') || '0', 10);
  const diff = until - Date.now();
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

export function setCooldown(seconds) {
  const until = Date.now() + seconds * 1000;
  sessionStorage.setItem('pixel_cooldown_until', until.toString());
}

export function clearCooldown() {
  sessionStorage.removeItem('pixel_cooldown_until');
}

