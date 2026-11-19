const crypto = require('crypto');

class QueryCache {
  constructor(ttlMs = 3000) {
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  key(query, vars) {
    return crypto.createHash('sha256').update(`${query}_${JSON.stringify(vars || {})}`).digest('hex');
  }

  get(k) {
    const entry = this.map.get(k);
    if (!entry) return null;
    if (Date.now() > entry.exp) {
      this.map.delete(k);
      return null;
    }
    return entry.data;
  }

  set(k, data) {
    if (this.map.size > 200) this.map.delete(this.map.keys().next().value);
    this.map.set(k, { data, exp: Date.now() + this.ttlMs });
  }

  clear() {
    this.map.clear();
  }
}

module.exports = { QueryCache };
