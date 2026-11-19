const CITIES = [
  { name: 'Minsk', country: 'Belarus', lat: 53.90, lon: 27.56 },
  { name: 'London', country: 'UK', lat: 51.51, lon: -0.13 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'New York', country: 'USA', lat: 40.71, lon: -74.01 }
];

const ASSETS = [
  { symbol: 'BTC/USD', market: 'Binance', base: 89000 },
  { symbol: 'ETH/USD', market: 'Coinbase', base: 3200 },
  { symbol: 'SPX', market: 'NYSE', base: 5900 },
  { symbol: 'GOLD', market: 'Commodity', base: 2680 }
];

const NODES = [
  { id: 'k8s-node-eu', region: 'Frankfurt', lat: 50.11, lon: 8.68 },
  { id: 'k8s-node-us', region: 'Virginia', lat: 38.89, lon: -77.03 },
  { id: 'edge-node-by', region: 'Minsk', lat: 53.90, lon: 27.56 }
];

function generateWeatherBatch(count, now) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const c = CITIES[i % CITIES.length];
    const val = +(15 + (Math.random() * 16 - 8)).toFixed(1);
    items.push({
      id: `WTH-${now}-${i}`,
      source: 'WEATHER',
      title: `${c.name} Station #${(i % 5) + 1}`,
      value: val,
      unit: '°C',
      status: val > 30 ? 'ALERT' : 'NORMAL',
      location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
      createdAt: new Date(now - (count - i) * 8000).toISOString()
    });
  }
  return items;
}

function generateFinanceBatch(count, now) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const a = ASSETS[i % ASSETS.length];
    const val = +(a.base * (1 + (Math.random() * 0.04 - 0.02))).toFixed(2);
    items.push({
      id: `FIN-${now}-${i}`,
      source: 'FINANCE',
      title: `${a.symbol} Feed`,
      value: val,
      unit: 'USD',
      status: 'NORMAL',
      location: { city: a.market, country: 'Exchange', coordinates: { lat: 40.71, lon: -74.00 } },
      createdAt: new Date(now - (count - i) * 6000).toISOString()
    });
  }
  return items;
}

function generateInfraBatch(count, now) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const n = NODES[i % NODES.length];
    const val = +(10 + Math.random() * 80).toFixed(1);
    items.push({
      id: `INF-${now}-${i}`,
      source: 'INFRASTRUCTURE',
      title: `${n.id}-${(i % 10) + 1}`,
      value: val,
      unit: '% CPU',
      status: val > 80 ? 'ALERT' : 'NORMAL',
      location: { city: n.region, country: 'Datacenter', coordinates: { lat: n.lat, lon: n.lon } },
      createdAt: new Date(now - (count - i) * 4000).toISOString()
    });
  }
  return items;
}

function collectData(count = 30) {
  const now = Date.now();
  const per = Math.ceil(count / 3);
  return [
    ...generateWeatherBatch(per, now),
    ...generateFinanceBatch(per, now),
    ...generateInfraBatch(per, now)
  ];
}

class IngestionManager {
  constructor(store) {
    this.store = store;
    this.timer = null;
  }

  seed(total = 10500) {
    const batch = collectData(total);
    this.store.addBatch(batch);
  }

  start(intervalMs = 15000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.store.addBatch(collectData(15));
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  collect(count = 30) {
    const batch = collectData(count);
    this.store.addBatch(batch);
    return batch.length;
  }
}

module.exports = { IngestionManager };
