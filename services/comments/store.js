const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const AUTHORS = [
  { id: 'usr-1', username: 'alex_meteo', badgeTitle: 'Senior Meteorologist', badgeLevel: 4 },
  { id: 'usr-2', username: 'elena_eco', badgeTitle: 'Lead Eco Inspector', badgeLevel: 5 },
  { id: 'usr-3', username: 'kenji_sensor', badgeTitle: 'IoT Station Engineer', badgeLevel: 3 },
  { id: 'usr-4', username: 'dmitry_analyst', badgeTitle: 'Climate Data Scientist', badgeLevel: 5 },
  { id: 'usr-5', username: 'sarah_health', badgeTitle: 'WHO Health Advisor', badgeLevel: 4 },
  { id: 'usr-6', username: 'olga_monitor', badgeTitle: 'Air Quality Specialist', badgeLevel: 2 }
];

const WEATHER_TEMPLATES = [
  'Калибровка метеодатчиков давления и влажности завершена без отклонений.',
  'Температурный тренд стабилен, опасных циклонических аномалий не обнаружено.',
  'Зафиксирован кратковременный скачок температуры выше контрольного порога.',
  'Синхронизация с региональным метеорологическим спутником выполнена успешно.'
];

const AIR_TEMPLATES = [
  'Концентрация мелкодисперсных частиц PM2.5 в пределах строгих стандартов ВОЗ.',
  'Зафиксирован повышенный уровень взвеси в приземном слое, рекомендуется мониторинг.',
  'Качество воздуха отличное, индекс чистоты атмосферы на максимальном уровне.',
  'Локальное скопление пылевых аэрозолей, показатели нормализуются с усилением ветра.'
];

const RADIATION_TEMPLATES = [
  'Ультрафиолетовый индекс находится в безопасной фоновой зеленой зоне.',
  'Повышенная солнечная инсоляция: индекс УФ умеренный, датчики откалиброваны.',
  'Высокая солнечная активность, уровень УФ требует применения защитных мер.',
  'Фоновый радиационный мониторинг сенсора в пределах естественных климатических норм.'
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

class CommentsStore {
  constructor(dbPath) {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    this.dbPath = dbPath || path.join(dataDir, 'comments.db');
    this.db = new DatabaseSync(this.dbPath);

    this.initSchema();
    this.initAuthors();
    this.seed(3000);
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS authors (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        badgeTitle TEXT NOT NULL,
        badgeLevel INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        recordId TEXT NOT NULL,
        content TEXT NOT NULL,
        authorId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_comments_recordId ON comments(recordId);
    `);
  }

  initAuthors() {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO authors (id, username, badgeTitle, badgeLevel)
      VALUES (?, ?, ?, ?)
    `);
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const a of AUTHORS) {
        stmt.run(a.id, a.username, a.badgeTitle, a.badgeLevel);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  get count() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM comments').get();
    return row ? row.count : 0;
  }

  get authors() {
    const rows = this.db.prepare('SELECT id, username, badgeTitle, badgeLevel FROM authors').all();
    return rows.map(a => ({
      id: a.id,
      username: a.username,
      badge: { title: a.badgeTitle, level: a.badgeLevel }
    }));
  }

  getAuthorById(id) {
    const a = this.db.prepare('SELECT id, username, badgeTitle, badgeLevel FROM authors WHERE id = ?').get(id);
    if (!a) return null;
    return {
      id: a.id,
      username: a.username,
      badge: { title: a.badgeTitle, level: a.badgeLevel }
    };
  }

  seed(count = 3000) {
    if (this.count >= count) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO comments (id, recordId, content, authorId, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    const needed = count - this.count;
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (let i = 1; i <= needed; i++) {
        const recordId = `WTH-sample-${(i % 500) + 1}`;
        const author = AUTHORS[i % AUTHORS.length];
        stmt.run(
          `COM-${i}`,
          recordId,
          WEATHER_TEMPLATES[i % WEATHER_TEMPLATES.length],
          author.id,
          new Date().toISOString()
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getByRecordId(recordId, limit = 5) {
    const rows = this.db.prepare(`
      SELECT id, recordId, content, authorId, createdAt
      FROM comments
      WHERE recordId = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(recordId, limit);

    if (rows && rows.length > 0) {
      return rows;
    }

    const h = hashString(recordId);
    let templates = WEATHER_TEMPLATES;
    if (recordId.startsWith('AIR')) templates = AIR_TEMPLATES;
    else if (recordId.startsWith('RAD')) templates = RADIATION_TEMPLATES;

    const author1 = AUTHORS[h % AUTHORS.length];
    const text1 = templates[h % templates.length];

    const author2 = AUTHORS[(h + 2) % AUTHORS.length];
    const text2 = templates[(h + 1) % templates.length];

    const list = [
      {
        id: `COM-${recordId}-1`,
        recordId,
        content: text1,
        authorId: author1.id,
        createdAt: new Date(Date.now() - (h % 3600) * 1000).toISOString()
      },
      {
        id: `COM-${recordId}-2`,
        recordId,
        content: text2,
        authorId: author2.id,
        createdAt: new Date(Date.now() - ((h % 3600) + 600) * 1000).toISOString()
      }
    ];

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO comments (id, recordId, content, authorId, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const c of list) {
        stmt.run(c.id, c.recordId, c.content, c.authorId, c.createdAt);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
    }

    return list.slice(0, limit);
  }

  addComment({ recordId, username, content }) {
    let authorRow = this.db.prepare('SELECT id, username, badgeTitle, badgeLevel FROM authors WHERE username = ?').get(username);
    if (!authorRow) {
      const newId = `usr-${Date.now()}`;
      this.db.prepare('INSERT INTO authors (id, username, badgeTitle, badgeLevel) VALUES (?, ?, ?, ?)').run(
        newId,
        username,
        'Eco Analyst',
        1
      );
      authorRow = { id: newId, username, badgeTitle: 'Eco Analyst', badgeLevel: 1 };
    }

    const comment = {
      id: `COM-${Date.now()}`,
      recordId,
      content,
      authorId: authorRow.id,
      createdAt: new Date().toISOString()
    };

    this.db.prepare(`
      INSERT INTO comments (id, recordId, content, authorId, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(comment.id, comment.recordId, comment.content, comment.authorId, comment.createdAt);

    return comment;
  }
}

module.exports = { CommentsStore, AUTHORS };
