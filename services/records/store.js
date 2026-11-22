const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

class RecordsStore {
  constructor(dbPath) {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    this.dbPath = dbPath || path.join(dataDir, 'records.db');
    this.db = new DatabaseSync(this.dbPath);

    this.initSchema();

    this.byId = {
      get: (id) => this.getById(id),
      has: (id) => Boolean(this.getById(id))
    };
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        status TEXT NOT NULL,
        city TEXT NOT NULL,
        country TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_created ON records(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_records_source ON records(source);
      CREATE INDEX IF NOT EXISTS idx_records_title_city ON records(title, city);
    `);
  }

  get count() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM records').get();
    return row ? row.count : 0;
  }

  get records() {
    return { length: this.count };
  }

  addBatch(items) {
    if (!items || !items.length) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO records (id, source, title, value, unit, status, city, country, lat, lon, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const item of items) {
        stmt.run(
          item.id,
          item.source,
          item.title,
          item.value,
          item.unit,
          item.status,
          item.location.city,
          item.location.country,
          item.location.coordinates.lat,
          item.location.coordinates.lon,
          item.createdAt
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  query({ search = '', source = null, sortField = 'CREATED_AT', sortOrder = 'DESC', page = 1, pageSize = 20 } = {}) {
    const conditions = [];
    const params = [];

    if (source && source !== 'ALL') {
      conditions.push('source = ?');
      params.push(source);
    }

    if (search && search.trim()) {
      conditions.push('(LOWER(title) LIKE ? OR LOWER(city) LIKE ?)');
      const term = `%${search.toLowerCase().trim()}%`;
      params.push(term, term);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderColumn = 'createdAt';
    if (sortField === 'VALUE') orderColumn = 'value';
    else if (sortField === 'TITLE') orderColumn = 'title';
    const orderDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM records ${whereClause}`);
    const totalCount = countStmt.get(...params)?.count || 0;

    const validPage = Math.max(1, page);
    const validSize = Math.max(1, Math.min(100, pageSize));
    const offset = (validPage - 1) * validSize;

    const queryStmt = this.db.prepare(`
      SELECT * FROM records ${whereClause}
      ORDER BY ${orderColumn} ${orderDirection}
      LIMIT ? OFFSET ?
    `);
    const rows = queryStmt.all(...params, validSize, offset);

    const items = rows.map(r => this.mapRow(r));
    const totalPages = Math.ceil(totalCount / validSize) || 1;

    return {
      items,
      totalCount,
      pageInfo: {
        currentPage: validPage,
        pageSize: validSize,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPrevPage: validPage > 1
      }
    };
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM records WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  deleteRecord(id) {
    const info = this.db.prepare('DELETE FROM records WHERE id = ?').run(id);
    return info.changes > 0;
  }

  getStats() {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN source = 'WEATHER' THEN 1 ELSE 0 END) as weather,
        SUM(CASE WHEN source = 'AIR_QUALITY' THEN 1 ELSE 0 END) as airQuality,
        SUM(CASE WHEN source = 'RADIATION' THEN 1 ELSE 0 END) as radiation,
        SUM(CASE WHEN status = 'ALERT' THEN 1 ELSE 0 END) as alerts
      FROM records
    `).get();

    return {
      total: row.total || 0,
      weather: row.weather || 0,
      airQuality: row.airQuality || 0,
      radiation: row.radiation || 0,
      alerts: row.alerts || 0
    };
  }

  mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      source: r.source,
      title: r.title,
      value: r.value,
      unit: r.unit,
      status: r.status,
      location: {
        city: r.city,
        country: r.country,
        coordinates: { lat: r.lat, lon: r.lon }
      },
      createdAt: r.createdAt
    };
  }
}

module.exports = { RecordsStore };
