const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;

function createInitialState() {
  const grid = {};
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      grid[`${x},${y}`] = {
        color: '#ffffff',
        owner: null,
        version: 0,
        updatedAt: 0
      };
    }
  }
  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    grid,
    scores: {},
    logs: []
  };
}

function loadState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && parsed.grid) {
        return parsed;
      }
    }
  } catch (err) {}
  const initial = createInitialState();
  saveState(initial);
  return initial;
}

function saveState(stateToSave) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
  } catch (err) {}
}

const gameState = loadState();

function recalculateScores() {
  const scores = {};
  for (const key in gameState.grid) {
    const owner = gameState.grid[key].owner;
    if (owner) {
      scores[owner] = (scores[owner] || 0) + 1;
    }
  }
  gameState.scores = scores;
}

function addLog(text, type = 'info') {
  const log = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString('ru-RU'),
    text,
    type
  };
  gameState.logs.unshift(log);
  if (gameState.logs.length > 30) {
    gameState.logs.pop();
  }
  return log;
}

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

const wss = new WebSocketServer({ server });

function broadcast(data, ignoreClient = null) {
  const message = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== ignoreClient) {
      client.send(message);
    }
  }
}

function getOnlineCount() {
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      count++;
    }
  }
  return count;
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'init',
    state: gameState,
    onlineCount: getOnlineCount()
  }));

  broadcast({
    type: 'online_count',
    onlineCount: getOnlineCount()
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'claim_cell') {
        const { x, y, color, expectedVersion, playerName } = data;
        const key = `${x},${y}`;

        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
          return;
        }

        const currentCell = gameState.grid[key] || {
          color: '#ffffff',
          owner: null,
          version: 0,
          updatedAt: 0
        };

        if (currentCell.version !== expectedVersion) {
          const log = addLog(`Конфликт! ${playerName || 'Игрок'} опоздал: ячейка (${x + 1}, ${y + 1}) уже занята ${currentCell.owner || 'кем-то'}`, 'conflict');
          saveState(gameState);

          ws.send(JSON.stringify({
            type: 'conflict',
            x,
            y,
            currentCell,
            message: `Конфликт! Ячейка (${x + 1}, ${y + 1}) уже изменена (${currentCell.owner || 'другим игроком'})`,
            log
          }));

          broadcast({
            type: 'log_entry',
            log
          }, ws);
          return;
        }

        currentCell.color = color;
        currentCell.owner = playerName || 'Аноним';
        currentCell.version = (currentCell.version || 0) + 1;
        currentCell.updatedAt = Date.now();
        gameState.grid[key] = currentCell;

        recalculateScores();
        const log = addLog(`${currentCell.owner} захватил ячейку (${x + 1}, ${y + 1})`, 'claim');
        saveState(gameState);

        broadcast({
          type: 'cell_updated',
          x,
          y,
          cell: currentCell,
          scores: gameState.scores,
          log
        });
      }

      if (data.type === 'sync_queue') {
        const actions = Array.isArray(data.actions) ? data.actions : [];
        const results = [];

        for (const action of actions) {
          const { x, y, color, expectedVersion, playerName } = action;
          const key = `${x},${y}`;
          const currentCell = gameState.grid[key];

          if (!currentCell) continue;

          if (currentCell.version === expectedVersion) {
            currentCell.color = color;
            currentCell.owner = playerName || 'Аноним';
            currentCell.version = (currentCell.version || 0) + 1;
            currentCell.updatedAt = Date.now();
            gameState.grid[key] = currentCell;

            const log = addLog(`${currentCell.owner} применил офлайн-действие (${x + 1}, ${y + 1})`, 'claim');
            results.push({ x, y, status: 'applied', cell: currentCell });

            broadcast({
              type: 'cell_updated',
              x,
              y,
              cell: currentCell,
              scores: gameState.scores,
              log
            }, ws);
          } else {
            const log = addLog(`Офлайн-конфликт для ${playerName || 'Игрока'} на (${x + 1}, ${y + 1})`, 'conflict');
            results.push({ x, y, status: 'conflict', cell: currentCell });
            broadcast({
              type: 'log_entry',
              log
            });
          }
        }

        recalculateScores();
        saveState(gameState);

        ws.send(JSON.stringify({
          type: 'sync_queue_result',
          results,
          state: gameState
        }));
      }

      if (data.type === 'reset_grid') {
        const fresh = createInitialState();
        gameState.grid = fresh.grid;
        gameState.scores = {};
        const log = addLog(`${data.playerName || 'Игрок'} сбросил поле`, 'reset');
        saveState(gameState);

        broadcast({
          type: 'grid_reset',
          state: gameState,
          log
        });
      }
    } catch (err) {}
  });

  ws.on('close', () => {
    broadcast({
      type: 'online_count',
      onlineCount: getOnlineCount()
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
