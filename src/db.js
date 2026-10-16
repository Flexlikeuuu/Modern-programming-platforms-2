const fs = require('fs');
const crypto = require('crypto');
const { DATA_DIR, DB_FILE } = require('./config');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;
let isNativeSqlite = false;

try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_FILE);
  isNativeSqlite = true;
} catch (e) {
  isNativeSqlite = false;
}

class FallbackDatabase {
  constructor(filePath) {
    this.filePath = filePath.replace(/\.db$/, '_fallback.json');
    this.data = {
      users: {},
      sessions: {},
      cells: {},
      logs: []
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (e) {}
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {}
  }
}

let fallbackDb = null;
if (!isNativeSqlite) {
  fallbackDb = new FallbackDatabase(DB_FILE);
}

function init() {
  if (isNativeSqlite) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        color TEXT DEFAULT '#e63946',
        score INTEGER DEFAULT 0,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        created_at INTEGER,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS cells (
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        color TEXT NOT NULL,
        owner TEXT,
        version INTEGER DEFAULT 0,
        updated_at INTEGER,
        PRIMARY KEY (x, y)
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT,
        text TEXT,
        type TEXT,
        created_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_cells_owner ON cells(owner);
    `);
  }
}

init();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function registerUser(username, password, color = '#e63946') {
  const cleanUsername = (username || '').trim();
  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
    return { success: false, error: 'Имя пользователя должно содержать от 3 до 20 символов' };
  }
  if (!/^[a-zA-Z0-9_а-яА-ЯёЁ\s\-]+$/.test(cleanUsername)) {
    return { success: false, error: 'Имя может содержать только буквы, цифры, пробел и дефис' };
  }
  if (!password || password.length < 4) {
    return { success: false, error: 'Пароль должен содержать не менее 4 символов' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const userId = 'u_' + crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  const token = generateToken();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

  if (isNativeSqlite) {
    try {
      const stmt = db.prepare(`
        INSERT INTO users (id, username, password_hash, salt, color, score, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `);
      stmt.run(userId, cleanUsername, passwordHash, salt, color, now);

      const sessionStmt = db.prepare(`
        INSERT INTO sessions (token, user_id, username, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      sessionStmt.run(token, userId, cleanUsername, now, expiresAt);

      return {
        success: true,
        token,
        user: { id: userId, username: cleanUsername, color, score: 0 }
      };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: `Пользователь "${cleanUsername}" уже зарегистрирован` };
      }
      return { success: false, error: 'Ошибка базы данных при регистрации' };
    }
  } else {
    const lower = cleanUsername.toLowerCase();
    for (const id in fallbackDb.data.users) {
      if (fallbackDb.data.users[id].username.toLowerCase() === lower) {
        return { success: false, error: `Пользователь "${cleanUsername}" уже зарегистрирован` };
      }
    }
    const user = { id: userId, username: cleanUsername, password_hash: passwordHash, salt, color, score: 0, created_at: now };
    fallbackDb.data.users[userId] = user;
    fallbackDb.data.sessions[token] = { token, user_id: userId, username: cleanUsername, created_at: now, expires_at: expiresAt };
    fallbackDb.save();
    return { success: true, token, user: { id: userId, username: cleanUsername, color, score: 0 } };
  }
}

function loginUser(username, password) {
  const cleanUsername = (username || '').trim();
  if (!cleanUsername || !password) {
    return { success: false, error: 'Укажите логин и пароль' };
  }

  if (isNativeSqlite) {
    const user = db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`).get(cleanUsername);
    if (!user) {
      return { success: false, error: 'Неверный логин или пароль' };
    }
    const hash = hashPassword(password, user.salt);
    const isValid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.password_hash, 'hex'));
    if (!isValid) {
      return { success: false, error: 'Неверный логин или пароль' };
    }

    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
    db.prepare(`INSERT INTO sessions (token, user_id, username, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`).run(token, user.id, user.username, now, expiresAt);

    return {
      success: true,
      token,
      user: { id: user.id, username: user.username, color: user.color, score: user.score }
    };
  } else {
    const lower = cleanUsername.toLowerCase();
    let found = null;
    for (const id in fallbackDb.data.users) {
      if (fallbackDb.data.users[id].username.toLowerCase() === lower) {
        found = fallbackDb.data.users[id];
        break;
      }
    }
    if (!found) return { success: false, error: 'Неверный логин или пароль' };
    const hash = hashPassword(password, found.salt);
    if (hash !== found.password_hash) return { success: false, error: 'Неверный логин или пароль' };

    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
    fallbackDb.data.sessions[token] = { token, user_id: found.id, username: found.username, created_at: now, expires_at: expiresAt };
    fallbackDb.save();
    return {
      success: true,
      token,
      user: { id: found.id, username: found.username, color: found.color, score: found.score }
    };
  }
}

function getUserByToken(token) {
  if (!token || typeof token !== 'string') return null;

  if (isNativeSqlite) {
    const session = db.prepare(`SELECT * FROM sessions WHERE token = ? AND expires_at > ?`).get(token, Date.now());
    if (!session) return null;
    const user = db.prepare(`SELECT id, username, color, score FROM users WHERE id = ?`).get(session.user_id);
    return user || null;
  } else {
    const session = fallbackDb.data.sessions[token];
    if (!session || session.expires_at < Date.now()) return null;
    const user = fallbackDb.data.users[session.user_id];
    if (!user) return null;
    return { id: user.id, username: user.username, color: user.color, score: user.score };
  }
}

function logout(token) {
  if (!token) return;
  if (isNativeSqlite) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  } else {
    delete fallbackDb.data.sessions[token];
    fallbackDb.save();
  }
}

function updateUserColor(username, color) {
  if (!username || !color) return;
  if (isNativeSqlite) {
    db.prepare(`UPDATE users SET color = ? WHERE username = ? COLLATE NOCASE`).run(color, username);
  } else {
    const lower = username.toLowerCase();
    for (const id in fallbackDb.data.users) {
      if (fallbackDb.data.users[id].username.toLowerCase() === lower) {
        fallbackDb.data.users[id].color = color;
        fallbackDb.save();
        break;
      }
    }
  }
}

function getAllCells() {
  if (isNativeSqlite) {
    return db.prepare(`SELECT x, y, color, owner, version, updated_at as updatedAt FROM cells`).all();
  } else {
    return Object.values(fallbackDb.data.cells);
  }
}

function getCell(x, y) {
  if (isNativeSqlite) {
    const row = db.prepare(`SELECT x, y, color, owner, version, updated_at as updatedAt FROM cells WHERE x = ? AND y = ?`).get(x, y);
    return row || { x, y, color: '#ffffff', owner: null, version: 0, updatedAt: 0 };
  } else {
    const key = `${x},${y}`;
    return fallbackDb.data.cells[key] || { x, y, color: '#ffffff', owner: null, version: 0, updatedAt: 0 };
  }
}

function claimCell(x, y, color, owner, expectedVersion) {
  const now = Date.now();
  const currentCell = getCell(x, y);

  if (currentCell.version !== expectedVersion) {
    return {
      success: false,
      conflict: true,
      currentCell
    };
  }

  const nextVersion = (currentCell.version || 0) + 1;

  if (isNativeSqlite) {
    if (currentCell.version === 0 && !currentCell.owner) {
      try {
        const stmt = db.prepare(`
          INSERT INTO cells (x, y, color, owner, version, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(x, y) DO UPDATE SET
            color = excluded.color,
            owner = excluded.owner,
            version = cells.version + 1,
            updated_at = excluded.updated_at
          WHERE cells.version = ?
        `);
        const info = stmt.run(x, y, color, owner, 1, now, expectedVersion);
        if (info.changes === 0) {
          return { success: false, conflict: true, currentCell: getCell(x, y) };
        }
      } catch (e) {
        return { success: false, conflict: true, currentCell: getCell(x, y) };
      }
    } else {
      const stmt = db.prepare(`
        UPDATE cells
        SET color = ?, owner = ?, version = ?, updated_at = ?
        WHERE x = ? AND y = ? AND version = ?
      `);
      const info = stmt.run(color, owner, nextVersion, now, x, y, expectedVersion);
      if (info.changes === 0) {
        return { success: false, conflict: true, currentCell: getCell(x, y) };
      }
    }

    db.prepare(`
      UPDATE users SET score = (SELECT COUNT(*) FROM cells WHERE owner = users.username COLLATE NOCASE)
      WHERE username = ? COLLATE NOCASE
    `).run(owner);

    return {
      success: true,
      cell: { x, y, color, owner, version: nextVersion, updatedAt: now }
    };
  } else {
    const key = `${x},${y}`;
    const newCell = { x, y, color, owner, version: nextVersion, updatedAt: now };
    fallbackDb.data.cells[key] = newCell;
    const lower = owner.toLowerCase();
    for (const id in fallbackDb.data.users) {
      if (fallbackDb.data.users[id].username.toLowerCase() === lower) {
        let count = 0;
        for (const k in fallbackDb.data.cells) {
          if (fallbackDb.data.cells[k].owner && fallbackDb.data.cells[k].owner.toLowerCase() === lower) {
            count++;
          }
        }
        fallbackDb.data.users[id].score = count;
        break;
      }
    }
    fallbackDb.save();
    return { success: true, cell: newCell };
  }
}

function getLeaderboard(limit = 10) {
  if (isNativeSqlite) {
    const rows = db.prepare(`
      SELECT owner as username, COUNT(*) as score
      FROM cells
      WHERE owner IS NOT NULL AND TRIM(owner) != ''
      GROUP BY owner
      ORDER BY score DESC
      LIMIT ?
    `).all(limit);

    const scores = {};
    for (const r of rows) {
      scores[r.username] = r.score;
    }
    return scores;
  } else {
    const scores = {};
    for (const key in fallbackDb.data.cells) {
      const owner = fallbackDb.data.cells[key].owner;
      if (owner) {
        scores[owner] = (scores[owner] || 0) + 1;
      }
    }
    return scores;
  }
}

function addLog(text, type = 'info') {
  const time = new Date().toLocaleTimeString('ru-RU');
  const now = Date.now();

  if (isNativeSqlite) {
    const info = db.prepare(`INSERT INTO logs (time, text, type, created_at) VALUES (?, ?, ?, ?)`).run(time, text, type, now);
    const log = { id: Number(info.lastInsertRowid), time, text, type };

    db.prepare(`
      DELETE FROM logs WHERE id NOT IN (
        SELECT id FROM logs ORDER BY id DESC LIMIT 50
      )
    `).run();

    return log;
  } else {
    const log = { id: now + Math.random(), time, text, type };
    fallbackDb.data.logs.unshift(log);
    if (fallbackDb.data.logs.length > 50) {
      fallbackDb.data.logs.pop();
    }
    fallbackDb.save();
    return log;
  }
}

function getLogs(limit = 30) {
  if (isNativeSqlite) {
    return db.prepare(`SELECT id, time, text, type FROM logs ORDER BY id DESC LIMIT ?`).all(limit);
  } else {
    return fallbackDb.data.logs.slice(0, limit);
  }
}

function resetGrid(actorName = 'Админ') {
  if (isNativeSqlite) {
    db.exec(`DELETE FROM cells; UPDATE users SET score = 0;`);
  } else {
    fallbackDb.data.cells = {};
    for (const id in fallbackDb.data.users) {
      fallbackDb.data.users[id].score = 0;
    }
    fallbackDb.save();
  }
  return addLog(`${actorName} сбросил поле`, 'reset');
}

module.exports = {
  isNativeSqlite,
  registerUser,
  loginUser,
  getUserByToken,
  logout,
  updateUserColor,
  getAllCells,
  getCell,
  claimCell,
  getLeaderboard,
  addLog,
  getLogs,
  resetGrid
};

