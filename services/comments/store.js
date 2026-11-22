const AUTHORS = [
  { id: 'usr-1', username: 'alex_meteo', badge: { title: 'Senior Meteorologist', level: 4 } },
  { id: 'usr-2', username: 'elena_eco', badge: { title: 'Lead Eco Inspector', level: 5 } },
  { id: 'usr-3', username: 'kenji_sensor', badge: { title: 'IoT Station Engineer', level: 3 } },
  { id: 'usr-4', username: 'dmitry_analyst', badge: { title: 'Climate Data Scientist', level: 5 } },
  { id: 'usr-5', username: 'sarah_health', badge: { title: 'WHO Health Advisor', level: 4 } },
  { id: 'usr-6', username: 'olga_monitor', badge: { title: 'Air Quality Specialist', level: 2 } }
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
  constructor() {
    this.comments = [];
    this.byRecord = new Map();
    this.authors = AUTHORS;
    this.seed(3000);
  }

  seed(count = 3000) {
    for (let i = 1; i <= count; i++) {
      const recordId = `WTH-sample-${(i % 500) + 1}`;
      const author = AUTHORS[i % AUTHORS.length];
      const comment = {
        id: `COM-${i}`,
        recordId,
        content: WEATHER_TEMPLATES[i % WEATHER_TEMPLATES.length],
        authorId: author.id,
        createdAt: new Date().toISOString()
      };
      this.comments.push(comment);
      if (!this.byRecord.has(recordId)) this.byRecord.set(recordId, []);
      this.byRecord.get(recordId).push(comment);
    }
  }

  getByRecordId(recordId, limit = 5) {
    if (this.byRecord.has(recordId)) {
      return this.byRecord.get(recordId).slice(0, limit);
    }

    const h = hashString(recordId);
    let templates = WEATHER_TEMPLATES;
    if (recordId.startsWith('AIR')) templates = AIR_TEMPLATES;
    else if (recordId.startsWith('RAD')) templates = RADIATION_TEMPLATES;

    const author1 = this.authors[h % this.authors.length];
    const text1 = templates[h % templates.length];

    const author2 = this.authors[(h + 2) % this.authors.length];
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

    this.byRecord.set(recordId, list);
    for (const c of list) this.comments.push(c);

    return list.slice(0, limit);
  }

  addComment({ recordId, username, content }) {
    let author = this.authors.find(a => a.username === username);
    if (!author) {
      author = { id: `usr-${this.authors.length + 1}`, username, badge: { title: 'Eco Analyst', level: 1 } };
      this.authors.push(author);
    }

    const comment = {
      id: `COM-${Date.now()}`,
      recordId,
      content,
      authorId: author.id,
      createdAt: new Date().toISOString()
    };

    this.comments.unshift(comment);
    if (!this.byRecord.has(recordId)) this.byRecord.set(recordId, []);
    this.byRecord.get(recordId).unshift(comment);
    return comment;
  }
}

module.exports = { CommentsStore, AUTHORS };
