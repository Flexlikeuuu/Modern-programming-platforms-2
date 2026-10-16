const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');
const { GRID_WIDTH, GRID_HEIGHT, COOLDOWN_SECONDS, COOLDOWN_MS } = require('./config');

const cooldowns = new Map();

function broadcast(wss, data, ignoreClient = null) {
  const message = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== ignoreClient) {
      client.send(message);
    }
  }
}

function getOnlineCount(wss) {
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      count++;
    }
  }
  return count;
}

function isNameTakenOnline(wss, name, excludeWs = null) {
  if (!name || typeof name !== 'string') return true;
  const normalized = name.trim().toLowerCase();
  if (normalized.length === 0) return true;

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      if (client.playerName && client.playerName.trim().toLowerCase() === normalized) {
        return true;
      }
    }
  }
  return false;
}

function generateUniqueGuestName(wss, excludeWs = null) {
  let counter = 1;
  while (isNameTakenOnline(wss, `Гость ${counter}`, excludeWs)) {
    counter++;
  }
  return `Гость ${counter}`;
}

function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.playerId = null;
    ws.userId = null;
    ws.user = null;
    ws.playerName = generateUniqueGuestName(wss, ws);

    ws.send(JSON.stringify({
      type: 'init',
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      claimedCells: db.getAllCells(),
      scores: db.getLeaderboard(20),
      logs: db.getLogs(30),
      onlineCount: getOnlineCount(wss),
      assignedName: ws.playerName,
      cooldownSeconds: COOLDOWN_SECONDS
    }));

    broadcast(wss, {
      type: 'online_count',
      onlineCount: getOnlineCount(wss)
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === 'auth_register') {
          const { username, password, color } = data;
          const result = db.registerUser(username, password, color || '#e63946');

          if (!result.success) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: result.error
            }));
            return;
          }

          ws.userId = result.user.id;
          ws.user = result.user;
          ws.playerName = result.user.username;

          ws.send(JSON.stringify({
            type: 'auth_success',
            token: result.token,
            user: result.user,
            message: `Регистрация прошла успешно! Добро пожаловать, ${result.user.username}!`
          }));

          const log = db.addLog(`Игрок ${result.user.username} зарегистрировался в игре`, 'info');
          broadcast(wss, {
            type: 'log_entry',
            log
          });
          return;
        }

        if (data.type === 'auth_login') {
          const { username, password } = data;
          const result = db.loginUser(username, password);

          if (!result.success) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: result.error
            }));
            return;
          }

          ws.userId = result.user.id;
          ws.user = result.user;
          ws.playerName = result.user.username;

          ws.send(JSON.stringify({
            type: 'auth_success',
            token: result.token,
            user: result.user,
            message: `С возвращением, ${result.user.username}!`
          }));
          return;
        }

        if (data.type === 'auth_token') {
          const token = data.token;
          const user = db.getUserByToken(token);

          if (user) {
            ws.userId = user.id;
            ws.user = user;
            ws.playerName = user.username;
            ws.send(JSON.stringify({
              type: 'auth_success',
              token,
              user,
              silent: true
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'auth_invalid'
            }));
          }
          return;
        }

        if (data.type === 'auth_logout') {
          const token = data.token;
          if (token) {
            db.logout(token);
          }
          ws.userId = null;
          ws.user = null;
          ws.playerName = generateUniqueGuestName(wss, ws);
          ws.send(JSON.stringify({
            type: 'auth_logged_out',
            guestName: ws.playerName
          }));
          return;
        }

        if (data.type === 'update_profile_color') {
          const color = data.color;
          if (ws.user && color) {
            ws.user.color = color;
            db.updateUserColor(ws.user.username, color);
            ws.send(JSON.stringify({
              type: 'profile_updated',
              user: ws.user
            }));
          }
          return;
        }

        if (data.type === 'init_player') {
          const playerId = data.playerId;
          const requestedName = typeof data.requestedName === 'string' ? data.requestedName.trim().slice(0, 20) : '';
          if (playerId) {
            ws.playerId = playerId;
          }

          if (data.token) {
            const user = db.getUserByToken(data.token);
            if (user) {
              ws.userId = user.id;
              ws.user = user;
              ws.playerName = user.username;
              ws.send(JSON.stringify({
                type: 'auth_success',
                token: data.token,
                user,
                silent: true
              }));
              return;
            }
          }

          if (requestedName && !isNameTakenOnline(wss, requestedName, ws)) {
            ws.playerName = requestedName;
            ws.send(JSON.stringify({
              type: 'name_assigned',
              playerName: requestedName,
              wasConflict: false
            }));
          } else {
            const uniqueName = generateUniqueGuestName(wss, ws);
            const wasConflict = Boolean(requestedName);
            ws.playerName = uniqueName;
            ws.send(JSON.stringify({
              type: 'name_assigned',
              playerName: uniqueName,
              wasConflict,
              message: wasConflict
                ? `Имя "${requestedName}" уже занято онлайн! Вам присвоено имя "${uniqueName}".`
                : null
            }));
          }
        }

        if (data.type === 'change_name') {
          if (ws.user) {
            ws.send(JSON.stringify({
              type: 'name_error',
              message: 'Вы вошли под зарегистрированным аккаунтом. Имя закреплено за вами!',
              currentName: ws.playerName
            }));
            return;
          }

          const requested = typeof data.requestedName === 'string' ? data.requestedName.trim().slice(0, 20) : '';
          if (!requested) {
            ws.send(JSON.stringify({
              type: 'name_error',
              message: 'Имя не может быть пустым!',
              currentName: ws.playerName
            }));
            return;
          }

          if (isNameTakenOnline(wss, requested, ws)) {
            ws.send(JSON.stringify({
              type: 'name_error',
              message: `Имя "${requested}" уже занято другим игроком онлайн!`,
              currentName: ws.playerName
            }));
            return;
          }

          const oldName = ws.playerName;
          ws.playerName = requested;
          ws.send(JSON.stringify({
            type: 'name_success',
            playerName: requested,
            message: `Имя изменено на "${requested}"`
          }));

          if (oldName && oldName !== requested) {
            const log = db.addLog(`${oldName} сменил имя на ${requested}`, 'info');
            broadcast(wss, {
              type: 'log_entry',
              log
            });
          }
        }

        if (data.type === 'claim_cell') {
          const { x, y, color, expectedVersion, playerId } = data;

          if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
            return;
          }

          const effectivePlayerId = playerId || ws.userId || ws.playerId || (ws.playerName ? `user_${ws.playerName}` : 'anonymous');
          ws.playerId = effectivePlayerId;

          const now = Date.now();
          const lastAction = cooldowns.get(effectivePlayerId) || 0;
          if (now - lastAction < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - lastAction)) / 1000);
            ws.send(JSON.stringify({
              type: 'cooldown_error',
              remaining
            }));
            return;
          }

          const result = db.claimCell(x, y, color, ws.playerName, expectedVersion);

          if (!result.success && result.conflict) {
            const currentCell = result.currentCell;
            const log = db.addLog(`Конфликт! ${ws.playerName} опоздал: ячейка (${x + 1}, ${y + 1}) уже занята ${currentCell.owner || 'кем-то'}`, 'conflict');

            ws.send(JSON.stringify({
              type: 'conflict',
              x,
              y,
              currentCell,
              message: `Конфликт! Ячейка (${x + 1}, ${y + 1}) уже изменена (${currentCell.owner || 'другим игроком'})`,
              log
            }));

            broadcast(wss, {
              type: 'log_entry',
              log
            }, ws);
            return;
          }

          cooldowns.set(effectivePlayerId, now);
          const cell = result.cell;
          const log = db.addLog(`${cell.owner} захватил ячейку (${x + 1}, ${y + 1})`, 'claim');

          ws.send(JSON.stringify({
            type: 'cooldown_started',
            seconds: COOLDOWN_SECONDS
          }));

          broadcast(wss, {
            type: 'cell_updated',
            x,
            y,
            cell,
            scores: db.getLeaderboard(20),
            log
          });
        }

        if (data.type === 'sync_queue') {
          const actions = Array.isArray(data.actions) ? data.actions : [];
          const results = [];
          const effectivePlayerId = data.playerId || ws.userId || ws.playerId || (ws.playerName ? `user_${ws.playerName}` : 'anonymous');
          ws.playerId = effectivePlayerId;
          const now = Date.now();

          let appliedAny = false;

          for (const action of actions) {
            const { x, y, color, expectedVersion } = action;
            if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;

            const result = db.claimCell(x, y, color, ws.playerName, expectedVersion);

            if (result.success) {
              const cell = result.cell;
              const log = db.addLog(`${cell.owner} применил офлайн-действие (${x + 1}, ${y + 1})`, 'claim');
              results.push({ x, y, status: 'applied', cell });
              appliedAny = true;

              broadcast(wss, {
                type: 'cell_updated',
                x,
                y,
                cell,
                scores: db.getLeaderboard(20),
                log
              }, ws);
            } else {
              const currentCell = result.currentCell;
              const log = db.addLog(`Офлайн-конфликт для ${ws.playerName} на (${x + 1}, ${y + 1})`, 'conflict');
              results.push({ x, y, status: 'conflict', cell: currentCell });
              broadcast(wss, {
                type: 'log_entry',
                log
              });
            }
          }

          if (appliedAny) {
            cooldowns.set(effectivePlayerId, now);
            ws.send(JSON.stringify({
              type: 'cooldown_started',
              seconds: COOLDOWN_SECONDS
            }));
          }

          ws.send(JSON.stringify({
            type: 'sync_queue_result',
            results,
            scores: db.getLeaderboard(20),
            logs: db.getLogs(30)
          }));
        }

        if (data.type === 'reset_grid') {
          const actorName = ws.playerName || 'Игрок';
          const log = db.resetGrid(actorName);

          broadcast(wss, {
            type: 'grid_reset',
            scores: {},
            log
          });
        }
      } catch (err) {}
    });

    ws.on('close', () => {
      ws.playerName = null;
      ws.playerId = null;
      ws.userId = null;
      ws.user = null;
      broadcast(wss, {
        type: 'online_count',
        onlineCount: getOnlineCount(wss)
      });
    });
  });

  return wss;
}

module.exports = {
  initWebSocketServer
};

