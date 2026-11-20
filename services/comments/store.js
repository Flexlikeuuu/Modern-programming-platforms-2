const AUTHORS = [
  { id: 'usr-1', username: 'alex_ops', badge: { title: 'Lead SRE', level: 4 } },
  { id: 'usr-2', username: 'elena_data', badge: { title: 'Data Scientist', level: 5 } },
  { id: 'usr-3', username: 'kenji_iot', badge: { title: 'IoT Engineer', level: 3 } },
  { id: 'usr-4', username: 'dmitry_dev', badge: { title: 'DevOps Architect', level: 5 } },
  { id: 'usr-5', username: 'sarah_fin', badge: { title: 'Quant Analyst', level: 4 } },
  { id: 'usr-6', username: 'olga_cloud', badge: { title: 'Cloud Specialist', level: 2 } }
];

const WEATHER_TEMPLATES = [
  'Калибровка датчиков давления и влажности завершена без отклонений.',
  'Температурный тренд стабилен, погодные аномалии в данном регионе отсутствуют.',
  'Зафиксирован кратковременный скачок температуры выше контрольного порога.',
  'Синхронизация с региональным метеорологическим спутником выполнена успешно.'
];

const FINANCE_TEMPLATES = [
  'Волатильность актива находится в пределах допустимого суточного коридора.',
  'Резкий приток ликвидности в биржевом стакане, спред сузился.',
  'Сформирован локальный уровень поддержки, объемы торгов стабильны.',
  'Зафиксирована серия крупных рыночных сделок, признаков манипуляций нет.'
];

const INFRA_TEMPLATES = [
  'Нагрузка на ядра CPU распределена между worker-нодами равномерно.',
  'Показатели утилизации памяти в норме, автоскейлинг подов не требуется.',
  'Пакетных потерь на сетевых интерфейсах кластера не обнаружено.',
  'Рекомендуется плановая оптимизация фоновых фоновых daemon-процессов.'
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
    if (recordId.startsWith('FIN')) templates = FINANCE_TEMPLATES;
    else if (recordId.startsWith('INF')) templates = INFRA_TEMPLATES;

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
      author = { id: `usr-${this.authors.length + 1}`, username, badge: { title: 'User', level: 1 } };
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
