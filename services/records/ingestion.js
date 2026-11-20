const CITIES = [
  { name: 'Minsk', country: 'Belarus', lat: 53.90, lon: 27.56 },
  { name: 'London', country: 'UK', lat: 51.51, lon: -0.13 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'New York', country: 'USA', lat: 40.71, lon: -74.01 }
];

const ASSETS = [
  { symbol: 'BTC/USD', market: 'Binance', pair: 'BTCUSDT', base: 89000 },
  { symbol: 'ETH/USD', market: 'Binance', pair: 'ETHUSDT', base: 3200 },
  { symbol: 'SOL/USD', market: 'Binance', pair: 'SOLUSDT', base: 180 },
  { symbol: 'BNB/USD', market: 'Binance', pair: 'BNBUSDT', base: 620 }
];

const NODES = [
  { id: 'cloudflare-edge-eu', region: 'Frankfurt', url: 'https://1.1.1.1/cdn-cgi/trace', lat: 50.11, lon: 8.68 },
  { id: 'google-dns-us', region: 'Virginia', url: 'https://dns.google/resolve?name=example.com', lat: 38.89, lon: -77.03 },
  { id: 'quad9-edge-by', region: 'Minsk', url: 'https://dns.quad9.net:5053/dns-query?name=example.com', lat: 53.90, lon: 27.56 }
];

async function fetchLiveWeather(c) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return +(data.current?.temperature_2m ?? (15 + (Math.random() * 6 - 3))).toFixed(1);
  } catch {
    return +(15 + (Math.random() * 12 - 6)).toFixed(1);
  }
}

async function fetchLivePrice(pair, fallback) {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return +(parseFloat(data.price)).toFixed(2);
  } catch {
    return +(fallback * (1 + (Math.random() * 0.02 - 0.01))).toFixed(2);
  }
}

async function measureNodeLatency(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    await res.text();
    const ms = +(performance.now() - start).toFixed(1);
    return Math.min(100, Math.max(5, ms));
  } catch {
    return +(20 + Math.random() * 50).toFixed(1);
  }
}

function generateLocalBatch(count, now) {
  const items = [];
  const per = Math.ceil(count / 3);

  for (let i = 0; i < per; i++) {
    const c = CITIES[i % CITIES.length];
    const val = +(14 + (Math.random() * 16 - 8)).toFixed(1);
    items.push({
      id: `WTH-${now}-${i}`,
      source: 'WEATHER',
      title: `${c.name} Station #${(i % 5) + 1}`,
      value: val,
      unit: '°C',
      status: val > 30 ? 'ALERT' : 'NORMAL',
      location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
      createdAt: new Date(now - (per - i) * 8000).toISOString()
    });
  }

  for (let i = 0; i < per; i++) {
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
      createdAt: new Date(now - (per - i) * 6000).toISOString()
    });
  }

  for (let i = 0; i < per; i++) {
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
      createdAt: new Date(now - (per - i) * 4000).toISOString()
    });
  }

  return items.slice(0, count);
}

async function collectLiveBatch(count = 30) {
  const now = Date.now();
  const items = [];
  const per = Math.max(1, Math.ceil(count / 3));

  const weatherPromises = CITIES.map(async (c, idx) => {
    const val = await fetchLiveWeather(c);
    return {
      id: `WTH-${now}-${idx}`,
      source: 'WEATHER',
      title: `${c.name} Live MetOp`,
      value: val,
      unit: '°C',
      status: val > 30 ? 'ALERT' : 'NORMAL',
      location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
      createdAt: new Date().toISOString()
    };
  });

  const financePromises = ASSETS.map(async (a, idx) => {
    const val = await fetchLivePrice(a.pair, a.base);
    return {
      id: `FIN-${now}-${idx}`,
      source: 'FINANCE',
      title: `${a.symbol} Live Feed`,
      value: val,
      unit: 'USD',
      status: 'NORMAL',
      location: { city: a.market, country: 'Exchange', coordinates: { lat: 40.71, lon: -74.00 } },
      createdAt: new Date().toISOString()
    };
  });

  const infraPromises = NODES.map(async (n, idx) => {
    const val = await measureNodeLatency(n.url);
    return {
      id: `INF-${now}-${idx}`,
      source: 'INFRASTRUCTURE',
      title: `${n.id}`,
      value: val,
      unit: '% CPU',
      status: val > 80 ? 'ALERT' : 'NORMAL',
      location: { city: n.region, country: 'Datacenter', coordinates: { lat: n.lat, lon: n.lon } },
      createdAt: new Date().toISOString()
    };
  });

  const [wItems, fItems, iItems] = await Promise.all([
    Promise.all(weatherPromises),
    Promise.all(financePromises),
    Promise.all(infraPromises)
  ]);

  items.push(...wItems, ...fItems, ...iItems);

  while (items.length < count) {
    const remaining = count - items.length;
    items.push(...generateLocalBatch(remaining, now - items.length * 1000));
  }

  return items.slice(0, count);
}

class IngestionManager {
  constructor(store) {
    this.store = store;
    this.timer = null;
  }

  seed(total = 10500) {
    const batch = generateLocalBatch(total, Date.now());
    this.store.addBatch(batch);
    this.collect(30).catch(console.error);
  }

  start(intervalMs = 15000) {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.collect(15);
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async collect(count = 30) {
    try {
      const batch = await collectLiveBatch(count);
      this.store.addBatch(batch);
      return batch.length;
    } catch {
      const fallback = generateLocalBatch(count, Date.now());
      this.store.addBatch(fallback);
      return fallback.length;
    }
  }
}

module.exports = { IngestionManager };
