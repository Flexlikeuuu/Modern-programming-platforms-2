const { metricsStore } = require('../services/monitoring/metrics');

function recordTrace({ operationName, query, durationMs, depth, hasErrors }) {
  metricsStore.recordTrace({
    id: `TR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    operationName: operationName || 'GraphQL Query',
    durationMs: +durationMs.toFixed(1),
    queryDepth: depth || 1,
    hasErrors: Boolean(hasErrors),
    snippet: (query || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  });
}

module.exports = { recordTrace };
