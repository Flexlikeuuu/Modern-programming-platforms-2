class MetricsStore {
  constructor() {
    this.startTime = Date.now();
    this.faults = {
      records: { name: 'records', port: 4001, fail: false },
      comments: { name: 'comments', port: 4002, fail: false },
      monitoring: { name: 'monitoring', port: 4003, fail: false }
    };
    this.traces = [];
  }

  recordTrace(trace) {
    this.traces.unshift(trace);
    if (this.traces.length > 30) this.traces.pop();
  }

  getTraces() {
    return this.traces;
  }

  getFault(name) {
    return this.faults[name] || { name, fail: false };
  }

  setFault(name, fail) {
    if (this.faults[name]) {
      this.faults[name].fail = Boolean(fail);
      return this.faults[name];
    }
    return { name, fail: false };
  }

  getSubgraphsHealth() {
    return Object.values(this.faults).map(s => ({
      name: s.name,
      port: s.port,
      status: s.fail ? 'FAIL' : 'ONLINE',
      isFailing: s.fail
    }));
  }

  getSystemMetrics() {
    const mem = process.memoryUsage();
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryRssMb: +(mem.rss / 1024 / 1024).toFixed(1),
      memoryHeapUsedMb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      nodeVersion: process.version
    };
  }
}

const metricsStore = new MetricsStore();

module.exports = { metricsStore };
