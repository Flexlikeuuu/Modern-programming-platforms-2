const CITIES = [
  { name: 'Minsk', country: 'Belarus', lat: 53.90, lon: 27.56 },
  { name: 'London', country: 'UK', lat: 51.51, lon: -0.13 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'New York', country: 'USA', lat: 40.71, lon: -74.01 },
  { name: 'Paris', country: 'France', lat: 48.85, lon: 2.35 },
  { name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.40 },
  { name: 'Dubai', country: 'UAE', lat: 25.20, lon: 55.27 },
  { name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21 },
  { name: 'Rome', country: 'Italy', lat: 41.90, lon: 12.50 },
  { name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.70 },
  { name: 'Warsaw', country: 'Poland', lat: 52.23, lon: 21.01 },
  { name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38 },
  { name: 'Los Angeles', country: 'USA', lat: 34.05, lon: -118.24 },
  { name: 'Seoul', country: 'South Korea', lat: 37.57, lon: 126.98 },
  { name: 'Beijing', country: 'China', lat: 39.90, lon: 116.40 },
  { name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.24 },
  { name: 'Istanbul', country: 'Turkey', lat: 41.01, lon: 28.98 },
  { name: 'Bangkok', country: 'Thailand', lat: 13.76, lon: 100.50 },
  { name: 'Sao Paulo', country: 'Brazil', lat: -23.55, lon: -46.63 },
  { name: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37 },
  { name: 'Amsterdam', country: 'Netherlands', lat: 52.37, lon: 4.89 },
  { name: 'Stockholm', country: 'Sweden', lat: 59.33, lon: 18.07 },
  { name: 'Oslo', country: 'Norway', lat: 59.91, lon: 10.75 },
  { name: 'Helsinki', country: 'Finland', lat: 60.17, lon: 24.94 },
  { name: 'Zurich', country: 'Switzerland', lat: 47.38, lon: 8.54 },
  { name: 'Prague', country: 'Czechia', lat: 50.08, lon: 14.44 },
  { name: 'Budapest', country: 'Hungary', lat: 47.50, lon: 19.04 },
  { name: 'Athens', country: 'Greece', lat: 37.98, lon: 23.73 },
  { name: 'Lisbon', country: 'Portugal', lat: 38.72, lon: -9.14 }
];

const LATS = CITIES.map(c => c.lat).join(',');
const LONS = CITIES.map(c => c.lon).join(',');

function generateLocalBatch(count, now) {
  const items = [];
  const per = Math.ceil(count / 3);

  for (let i = 0; i < per; i++) {
    const c = CITIES[i % CITIES.length];
    const val = +(15 + (Math.random() * 18 - 9)).toFixed(1);
    items.push({
      id: `WTH-${now}-${i}`,
      source: 'WEATHER',
      title: `${c.name} Weather Station #${(i % 5) + 1}`,
      value: val,
      unit: '°C',
      status: val > 35 || val < -15 ? 'ALERT' : 'NORMAL',
      location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
      createdAt: new Date(now - (per - i) * 8000).toISOString()
    });
  }

  for (let i = 0; i < per; i++) {
    const c = CITIES[(i + 5) % CITIES.length];
    const val = +(8 + Math.random() * 32).toFixed(1);
    items.push({
      id: `AIR-${now}-${i}`,
      source: 'AIR_QUALITY',
      title: `${c.name} PM2.5 Sensor #${(i % 5) + 1}`,
      value: val,
      unit: 'µg/m³',
      status: val > 35 ? 'ALERT' : 'NORMAL',
      location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
      createdAt: new Date(now - (per - i) * 6000).toISOString()
    });
  }

  for (let i = 0; i < per; i++) {
    const c = CITIES[(i + 10) % CITIES.length];
    const val = +(Math.random() * 9).toFixed(1);
    items.push({
      id: `RAD-${now}-${i}`,
      source: 'RADIATION',
      title: `${c.name} Solar UV Sensor #${(i % 5) + 1}`,
      value: val,
      unit: 'UV',
      status: val > 7 ? 'ALERT' : 'NORMAL',
      location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
      createdAt: new Date(now - (per - i) * 4000).toISOString()
    });
  }

  return items.slice(0, count);
}

async function collectLiveBatch(count = 30) {
  const now = Date.now();

  try {
    const [wRes, aRes, rRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LATS}&longitude=${LONS}&current=temperature_2m`, { signal: AbortSignal.timeout(4000) }),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LATS}&longitude=${LONS}&current=pm2_5`, { signal: AbortSignal.timeout(4000) }),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LATS}&longitude=${LONS}&current=uv_index`, { signal: AbortSignal.timeout(4000) })
    ]);

    const [wData, aData, rData] = await Promise.all([
      wRes.ok ? wRes.json() : [],
      aRes.ok ? aRes.json() : [],
      rRes.ok ? rRes.json() : []
    ]);

    const wList = Array.isArray(wData) ? wData : [wData];
    const aList = Array.isArray(aData) ? aData : [aData];
    const rList = Array.isArray(rData) ? rData : [rData];

    const weatherItems = wList.map((item, idx) => {
      const c = CITIES[idx % CITIES.length];
      const val = +(item.current?.temperature_2m ?? (15 + (Math.random() * 6 - 3))).toFixed(1);
      return {
        id: `WTH-${now}-${idx}`,
        source: 'WEATHER',
        title: `${c.name} Weather Sensor`,
        value: val,
        unit: '°C',
        status: val > 35 || val < -15 ? 'ALERT' : 'NORMAL',
        location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
        createdAt: new Date().toISOString()
      };
    });

    const airItems = aList.map((item, idx) => {
      const c = CITIES[idx % CITIES.length];
      const val = +(item.current?.pm2_5 ?? (12 + (Math.random() * 8 - 4))).toFixed(1);
      return {
        id: `AIR-${now}-${idx}`,
        source: 'AIR_QUALITY',
        title: `${c.name} PM2.5 Air Sensor`,
        value: val,
        unit: 'µg/m³',
        status: val > 35 ? 'ALERT' : 'NORMAL',
        location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
        createdAt: new Date().toISOString()
      };
    });

    const radItems = rList.map((item, idx) => {
      const c = CITIES[idx % CITIES.length];
      const val = +(item.current?.uv_index ?? (3 + (Math.random() * 4 - 2))).toFixed(1);
      return {
        id: `RAD-${now}-${idx}`,
        source: 'RADIATION',
        title: `${c.name} Solar UV Sensor`,
        value: val,
        unit: 'UV',
        status: val > 7 ? 'ALERT' : 'NORMAL',
        location: { city: c.name, country: c.country, coordinates: { lat: c.lat, lon: c.lon } },
        createdAt: new Date().toISOString()
      };
    });

    const allLiveItems = [];
    const maxLen = Math.max(weatherItems.length, airItems.length, radItems.length);
    for (let i = 0; i < maxLen; i++) {
      if (weatherItems[i]) allLiveItems.push(weatherItems[i]);
      if (airItems[i]) allLiveItems.push(airItems[i]);
      if (radItems[i]) allLiveItems.push(radItems[i]);
    }

    if (allLiveItems.length >= count) {
      return allLiveItems.slice(0, count);
    }

    const remaining = count - allLiveItems.length;
    return [...allLiveItems, ...generateLocalBatch(remaining, now - 1000)];
  } catch {
    return generateLocalBatch(count, now);
  }
}

class IngestionManager {
  constructor(store) {
    this.store = store;
    this.timer = null;
  }

  seed(total = 10500) {
    if (this.store.count < total) {
      const needed = total - this.store.count;
      const batch = generateLocalBatch(needed, Date.now());
      this.store.addBatch(batch);
    }
    this.collect(30).catch(console.error);
  }

  start(intervalMs = 15000) {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.collect(30);
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
