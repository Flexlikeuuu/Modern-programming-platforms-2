import { GRID_WIDTH, GRID_HEIGHT } from './config.js';
import { state } from './state.js';

let canvas, ctx, container, zoomBadge;
let cellSize = 6;
let scale = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let hasDragged = false;
let onCellClickCallback = null;

export function initCanvas(onCellClick) {
  onCellClickCallback = onCellClick;
  container = document.getElementById('canvas-container');
  canvas = document.getElementById('board-canvas');
  ctx = canvas.getContext('2d');
  zoomBadge = document.getElementById('zoom-level');

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderCanvas();
  });

  resetViewport();
  setupCanvasEvents();
}

export function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function resetViewport() {
  const rect = container.getBoundingClientRect();
  const boardWidth = GRID_WIDTH * cellSize;
  const boardHeight = GRID_HEIGHT * cellSize;

  const scaleX = (rect.width - 40) / boardWidth;
  const scaleY = (rect.height - 40) / boardHeight;
  scale = Math.max(0.2, Math.min(scaleX, scaleY, 1.5));

  panX = (rect.width - boardWidth * scale) / 2;
  panY = (rect.height - boardHeight * scale) / 2;

  updateZoomUI();
  renderCanvas();
}

export function zoomIn() {
  const rect = container.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const newScale = Math.min(scale * 1.25, 12);
  panX = cx - (cx - panX) * (newScale / scale);
  panY = cy - (cy - panY) * (newScale / scale);
  scale = newScale;
  updateZoomUI();
  renderCanvas();
}

export function zoomOut() {
  const rect = container.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const newScale = Math.max(scale * 0.8, 0.15);
  panX = cx - (cx - panX) * (newScale / scale);
  panY = cy - (cy - panY) * (newScale / scale);
  scale = newScale;
  updateZoomUI();
  renderCanvas();
}

function updateZoomUI() {
  if (zoomBadge) {
    zoomBadge.textContent = `${Math.round(scale * 100)}%`;
  }
}

function screenToBoardCoords(screenX, screenY) {
  const boardX = screenX - panX;
  const boardY = screenY - panY;
  const w = cellSize * scale;
  const h = cellSize * scale;

  const x = Math.floor(boardX / w);
  const y = Math.floor(boardY / h);

  if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
    return { x, y };
  }
  return null;
}

export function renderCanvas() {
  if (!ctx || !container) return;
  const rect = container.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  const boardWidth = GRID_WIDTH * cellSize;
  const boardHeight = GRID_HEIGHT * cellSize;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, boardWidth, boardHeight);

  for (const key in state.gridState) {
    const cell = state.gridState[key];
    if (cell && cell.color && cell.color !== '#ffffff') {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = cell.color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  for (const item of state.offlineQueue) {
    ctx.fillStyle = item.color;
    ctx.fillRect(item.x * cellSize, item.y * cellSize, cellSize, cellSize);
  }

  if (scale * cellSize >= 7) {
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
    ctx.lineWidth = 1 / scale;

    ctx.beginPath();
    for (let x = 0; x <= GRID_WIDTH; x++) {
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, boardHeight);
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(boardWidth, y * cellSize);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2 / scale;
  ctx.strokeRect(0, 0, boardWidth, boardHeight);

  for (const item of state.offlineQueue) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(item.x * cellSize, item.y * cellSize, cellSize, cellSize);
  }

  const now = Date.now();
  for (const [key, timestamp] of state.conflictFlashCells.entries()) {
    if (now - timestamp < 800) {
      const [fx, fy] = key.split(',').map(Number);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3 / scale;
      ctx.strokeRect(fx * cellSize, fy * cellSize, cellSize, cellSize);
    } else {
      state.conflictFlashCells.delete(key);
    }
  }

  if (state.hoveredCell) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(state.hoveredCell.x * cellSize, state.hoveredCell.y * cellSize, cellSize, cellSize);
  }

  ctx.restore();
}

function setupCanvasEvents() {
  const hoverInfoEl = document.getElementById('cell-hover-info');

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    hasDragged = false;
    canvas.classList.add('panning');
  });

  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged = true;
        panX += dx;
        panY += dy;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        renderCanvas();
      }
    }

    const coords = screenToBoardCoords(mouseX, mouseY);
    if (coords) {
      if (!state.hoveredCell || state.hoveredCell.x !== coords.x || state.hoveredCell.y !== coords.y) {
        state.hoveredCell = coords;
        const cellData = state.gridState[`${coords.x},${coords.y}`];
        if (hoverInfoEl) {
          if (cellData && cellData.owner) {
            hoverInfoEl.textContent = `(${coords.x + 1}, ${coords.y + 1}) | Владелец: ${cellData.owner} (v${cellData.version || 0})`;
          } else {
            hoverInfoEl.textContent = `(${coords.x + 1}, ${coords.y + 1}) | Свободно (v0)`;
          }
        }
        renderCanvas();
      }
    } else if (state.hoveredCell) {
      state.hoveredCell = null;
      if (hoverInfoEl) {
        hoverInfoEl.textContent = 'Наведите курсор на холст (100x100)';
      }
      renderCanvas();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (isDragging) {
      isDragging = false;
      canvas.classList.remove('panning');

      if (!hasDragged && onCellClickCallback) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const coords = screenToBoardCoords(mouseX, mouseY);
        if (coords) {
          onCellClickCallback(coords.x, coords.y);
        }
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(0.15, Math.min(scale * zoomFactor, 12));

    panX = mouseX - (mouseX - panX) * (newScale / scale);
    panY = mouseY - (mouseY - panY) * (newScale / scale);
    scale = newScale;

    updateZoomUI();
    renderCanvas();
  }, { passive: false });
}

