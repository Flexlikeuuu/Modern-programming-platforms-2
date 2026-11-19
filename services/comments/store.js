const AUTHORS = [
  { id: 'usr-1', username: 'alex_ops', badge: { title: 'Lead SRE', level: 4 } },
  { id: 'usr-2', username: 'elena_data', badge: { title: 'Data Scientist', level: 5 } },
  { id: 'usr-3', username: 'kenji_iot', badge: { title: 'IoT Engineer', level: 3 } }
];

const TEMPLATES = [
  'Показатели стабильны, телеметрия в пределах ожидаемых норм.',
  'Зафиксировано отклонение от контрольного порога, требуется калибровка.',
  'Высокая точность выборки данных, синхронизация прошла успешно.',
  'Успешная обработка в реальном времени, пакетных потерь не обнаружено.'
];

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
        content: TEMPLATES[i % TEMPLATES.length],
        authorId: author.id,
        createdAt: new Date().toISOString()
      };
      this.comments.push(comment);
      if (!this.byRecord.has(recordId)) this.byRecord.set(recordId, []);
      this.byRecord.get(recordId).push(comment);
    }
  }

  getByRecordId(recordId, limit = 5) {
    const list = this.byRecord.get(recordId) || [
      {
        id: `COM-auto-${recordId.slice(-4)}`,
        recordId,
        content: 'Автоматический анализ: телеметрия проверена системой мониторинга.',
        authorId: 'usr-1',
        createdAt: new Date().toISOString()
      }
    ];
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
