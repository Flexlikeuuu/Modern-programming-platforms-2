# Лабораторная работа №5: Распределенная клиент-серверная система GraphQL

## 1. Архитектура и микросервисы

Система реализована на архитектуре **GraphQL Federation v2**:

```
                  [ Frontend Web Client ]
                             │
                             ▼ (POST /graphql)
                 [ Apollo Gateway (:4000) ]
                 - Rate Limiter (150 req/min)
                 - Depth Limiter (max 8)
                 - Response LRU Cache
                 - Distributed Tracing
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼ :4001               ▼ :4002               ▼ :4003
[ Records Subgraph ]   [ Comments Subgraph ]   [ Monitoring Subgraph ]
- 3 источника данных   - Отзывы/комментарии    - Системные метрики
- >10,000 записей      - DataLoader (батчинг)  - Статусы подграфов
- Фильтры, сортировка  - Авторы и бейджи       - Имитация сбоев (Chaos)
- Поиск, пагинация
```

### Порты сервисов:
- Web-интерфейс: `http://localhost:4000/`
- Единый GraphQL API: `http://localhost:4000/graphql`
- Records Subgraph: `http://localhost:4001/`
- Comments Subgraph: `http://localhost:4002/`
- Monitoring Subgraph: `http://localhost:4003/`

---

## 2. Структура проекта

```
gateway/
  ├── index.js          # Шлюз Apollo Gateway + Express
  ├── rateLimiter.js    # Rate limiting (150 req/min)
  ├── depthLimiter.js   # Ограничение глубины запросов (макс 8)
  ├── cache.js          # Кэширование ответов
  └── tracer.js         # Трассировка запросов
services/
  ├── records/          # Подграф 1: Сбор и хранение (>10000 записей)
  │   ├── index.js      # Сервер подграфа :4001
  │   ├── schema.js     # GraphQL схема (Record, Location, Coordinates)
  │   ├── resolvers.js  # Поиск, фильтры, сортировка, пагинация
  │   ├── store.js      # Хранилище с индексами
  │   └── ingestion.js  # Сборщик из 3 источников (WEATHER, FINANCE, INFRASTRUCTURE)
  ├── comments/         # Подграф 2: Федеративные комментарии
  │   ├── index.js      # Сервер подграфа :4002
  │   ├── schema.js     # Схема (расширяет Record через Federation)
  │   ├── resolvers.js  # Резолверы с вложенностью до 5 уровней
  │   ├── dataLoader.js # DataLoader батчинг (против N+1)
  │   └── store.js      # Хранилище комментариев
  └── monitoring/       # Подграф 3: Мониторинг и метрики
      ├── index.js      # Сервер подграфа :4003
      ├── schema.js     # Схема системных метрик и сбоев
      ├── resolvers.js  # Резолверы
      └── metrics.js    # Системные ресурсы и спаны трассировки
public/
  ├── index.html        # Интерфейс (Данные, Конструктор, Мониторинг)
  ├── style.css         # Стили интерфейса
  └── app.js            # Клиент (только GraphQL запросы)
index.js                # Главный файл запуска всех сервисов
package.json            # Зависимости
```

---

## 3. Выполнение требований

1. **Взаимодействие только через GraphQL**: Все операции выполняются через `POST /graphql`.
2. **Сбор данных из 3 источников (>10,000 записей)**:
   - Метеостанции (`WEATHER`);
   - Финансовые котировки (`FINANCE`);
   - Кластерная инфраструктура (`INFRASTRUCTURE`).
   - Исходно предзагружено >10,500 записей + периодический фоновый сбор.
3. **Различные типы операций и вложенность**:
   - Query (чтение, пагинация, фильтрация) и Mutation (сбор данных, имитация сбоев).
   - Вложенность до 5 уровней: `Record -> location -> coordinates` и `Record -> comments -> author -> badge -> level`.
   - Интерактивный конструктор запросов (Query Builder) в веб-интерфейсе.
4. **Фильтрация, сортировка, поиск, пагинация**:
   - Полнотекстовый поиск.
   - Фильтрация по источникам (`WEATHER`, `FINANCE`, `INFRASTRUCTURE`).
   - Сортировка по дате, значению, названию (`ASC` / `DESC`).
   - Пагинация с выбором размера страницы.
5. **Производительность и отказоустойчивость**:
   - DataLoader устраняет проблему $N+1$ при объединении комментариев с записями.
   - Кэширование запросов на шлюзе (`X-Cache: HIT/MISS`).
   - Изоляция сбоев: при отказе подграфа комментариев основной каталог записей продолжает работать.
6. **Контроль нагрузки, мониторинг и трассировка**:
   - Rate Limiter (150 req/min).
   - Depth Limiter (максимальная глубина 8).
   - Uptime, оперативная память (RSS, Heap).
   - Журнал распределенной трассировки.
7. **GraphQL Federation**:
   - Архитектура на основе Apollo Federation v2 с директивами `@key` и `@external`.

---

## 4. Запуск

```bash
npm install
npm start
```

Веб-приложение откроется по адресу:
`http://localhost:4000/`

---

## 5. Примеры GraphQL запросов

### Глубокий запрос (5 уровней вложенности)
```graphql
query DeepQuery {
  records(pageSize: 2) {
    items {
      title
      value
      location {
        city
        coordinates { lat lon }
      }
      comments(limit: 1) {
        content
        author {
          username
          badge { title level }
        }
      }
    }
    totalCount
  }
}
```

### Сбор новых данных (Mutation)
```graphql
mutation Ingest {
  triggerIngest(count: 30)
}
```

### Имитация сбоя подграфа (Chaos Testing Mutation)
```graphql
mutation Chaos {
  simulateFault(subgraph: "comments", fail: true) {
    name
    status
    isFailing
  }
}
```
