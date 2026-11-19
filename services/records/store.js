class RecordsStore {
  constructor() {
    this.records = [];
    this.byId = new Map();
    this.maxCapacity = 20000;
  }

  addBatch(items) {
    for (const item of items) {
      this.records.unshift(item);
      this.byId.set(item.id, item);
    }
    if (this.records.length > this.maxCapacity) {
      const removed = this.records.splice(this.maxCapacity);
      for (const r of removed) this.byId.delete(r.id);
    }
  }

  query({ search = '', source = null, sortField = 'CREATED_AT', sortOrder = 'DESC', page = 1, pageSize = 20 } = {}) {
    let list = this.records;

    if (source && source !== 'ALL') {
      list = list.filter(r => r.source === source);
    }

    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      list = list.filter(r =>
        r.title.toLowerCase().includes(term) ||
        r.location.city.toLowerCase().includes(term)
      );
    }

    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortField === 'VALUE') diff = a.value - b.value;
      else if (sortField === 'TITLE') diff = a.title.localeCompare(b.title);
      else diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'ASC' ? diff : -diff;
    });

    const totalCount = list.length;
    const validPage = Math.max(1, page);
    const validSize = Math.max(1, Math.min(100, pageSize));
    const offset = (validPage - 1) * validSize;
    const items = list.slice(offset, offset + validSize);
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

  deleteRecord(id) {
    if (!this.byId.has(id)) return false;
    this.byId.delete(id);
    const idx = this.records.findIndex(r => r.id === id);
    if (idx !== -1) this.records.splice(idx, 1);
    return true;
  }

  getStats() {
    return {
      total: this.records.length,
      weather: this.records.filter(r => r.source === 'WEATHER').length,
      finance: this.records.filter(r => r.source === 'FINANCE').length,
      infra: this.records.filter(r => r.source === 'INFRASTRUCTURE').length,
      alerts: this.records.filter(r => r.status === 'ALERT').length
    };
  }
}

module.exports = { RecordsStore };
