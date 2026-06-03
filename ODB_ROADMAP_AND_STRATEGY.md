# ODB Platform — Дорожня карта та Стратегія
> Версія 1.0 · 21.05.2026

---

## ПОТОЧНИЙ СТАН (Phase 3 — MVP)

### Що вже є ✅
```
Core Platform:      167k records · Auth · Search · CRUD
Person Profile:     7 tabs · OSINT · Registries · PDF · AI Summary
Intelligence:       Telegram (Telethon) · FindFace · Social · Kadaster
Registries:        НАЗК · ЄРБ · МВС · Миротворець · NumBuster
Leaks:             VPS PostgreSQL ready · Import UI · Batch API
Identifier Search: Phone/IPN/Passport/SNILS/Email unified search
War Crimes:        Incidents module · Person linking · Evidence
Multi-lang:        UA/EN/RU
Export:            PDF print report
```

---

## ФАЗОВІ ПЛАНИ

---

### PHASE 4 — Стабілізація та продаж (2–4 тижні)

**Мета:** Зафіксувати робочу MVP версію, виправити критичні баги, підготувати до демо.

#### 4.1 Критичні виправлення (Тиждень 1)
```
[ ] ERB/Myrotvorets — перенести запити на Next.js (UA IP замість VPS NL)
[ ] GetContact токен — додати до VPS .env
[ ] Instagram rate limit — додати затримку 3-5с між запитами  
[ ] VK токен — додати до .env.local
[ ] Leaks DB — завантажити хоча б 1 тестовий датасет (МТС/Гослуслуги)
[ ] AI профіль ключ — додати ANTHROPIC_API_KEY
```

#### 4.2 Стабільність (Тиждень 1-2)
```
[ ] VPS backup script — щоденний backup odb_leaks + .session файлу
[ ] Health monitor — Telegram alert якщо сервіс падає
[ ] Rate limiting на API — захист від перевантаження
[ ] Error logging — зберігати помилки в Supabase або файл
[ ] VPS upgrade — 2GB RAM ($12/міс) для стабільності
```

#### 4.3 Demo-ready (Тиждень 2-3)
```
[ ] Заповнити базу 5-10 демо-персонажів з повними даними
[ ] Тестовий звіт PDF — для презентації
[ ] Demo account — окремий user з read-only даними
[ ] Landing page — опис продукту для покупця
[ ] Video walkthrough — 5хв screencast
```

---

### PHASE 5 — Розширення джерел (1-2 місяці)

**Мета:** Охопити максимум відкритих джерел, довести модульний рахунок до 30+.

#### 5.1 Українські реєстри
```
[ ] ЄДРПОУ (ФОП/ТОВ) — власники бізнесу через data.gov.ua
[ ] ФОП пошук — підприємці за ПІБ/ІПН
[ ] ЗАГС записи — народження/смерть/шлюб (де доступно)
[ ] Реєстр нотаріусів — перевірка нотаріусів
[ ] Реєстр суддів — відкриті дані
[ ] Люстрація — список люстрованих осіб
[ ] ЦВК — кандидати на виборах
[ ] Штрафи ПДД — інтеграція з системою платежів
[ ] Реєстр адвокатів (вже є, але потрібне тестування)
```

#### 5.2 Російські реєстри (з VPS)
```
[ ] ФССП пошук — виконавчі провадження
[ ] Гослуслуги витоки — через leaks import
[ ] РосРеєстр — нерухомість
[ ] ЄГРЮЛ/ЄГРІП — бізнес РФ
[ ] Реєстр зброї
```

#### 5.3 Розширений OSINT
```
[ ] LinkedIn пошук — через proxy/API
[ ] YouTube channel search
[ ] Telegram channel/group index
[ ] WHOIS / DNS / IP lookup
[ ] GitHub профіль
[ ] Pipl / Spokeo API
[ ] Hunter.io email verification
```

---

### PHASE 6 — Intelligence Engine (2-4 місяці)

**Мета:** Автоматизована розвідка, зв'язки, граф.

#### 6.1 Автоматичне збагачення
```
[ ] Queue system (Redis/BullMQ) — фонова обробка OSINT
[ ] Scheduled enrichment — оновлювати записи кожні 30 днів
[ ] Duplicate detection — знаходити дублікати по ПІБ/тел/ІПН
[ ] Confidence scoring — оцінка достовірності кожного поля
[ ] Auto-linking — автоматично зв'язувати осіб зі спільними даними
```

#### 6.2 Graph Intelligence
```
[ ] Neo4j або pgvector для графових запитів
[ ] "Хто ще пов'язаний з цим номером телефону?"
[ ] "Всі особи цього підрозділу"
[ ] "Ланцюжок командування" від солдата до генерала
[ ] Кластеризація за підрозділами
[ ] Timeline view — хронологія подій особи
```

#### 6.3 AI Intelligence
```
[ ] GPT-4/Claude — автоматичні зведення по групі осіб
[ ] Named Entity Recognition — витягувати дані з текстів
[ ] OCR — читати документи, посвідчення, листи
[ ] Face clustering — групувати фото однієї особи
[ ] Translation pipeline — авто-переклад джерел
[ ] Sentiment analysis — тональність публікацій
```

---

### PHASE 7 — Enterprise (4-8 місяців)

**Мета:** Продаж організаціям, мультикористувачевий доступ, API.

#### 7.1 Multi-tenancy
```
[ ] Organizations — кілька команд в одній системі
[ ] Role system — viewer / analyst / admin / superadmin
[ ] Audit log — хто що дивився/змінював
[ ] Case management — справи (investigation folders)
[ ] Task assignment — завдання між аналітиками
[ ] Comments/annotations — нотатки до записів
```

#### 7.2 External API
```
[ ] REST API з API key auth
[ ] Webhooks — notify при оновленні запису
[ ] Bulk import/export API
[ ] Swagger/OpenAPI документація
[ ] Rate limiting per key
[ ] Sandbox environment
```

#### 7.3 Infrastructure
```
[ ] Docker Compose — легкий self-hosted деплой
[ ] Kubernetes — масштабування
[ ] CDN для фото/медіа
[ ] S3-compatible storage
[ ] Elasticsearch — повнотекстовий пошук
[ ] Automated backups до S3
```

---

## СТРАТЕГІЯ МОНЕТИЗАЦІЇ

### Модель 1 — Одноразовий продаж (найшвидший $$$)

**Покупці:**
- Журналісти-розслідувачі (Bellingcat UA, Схеми, Слідство.Інфо)
- Волонтерські OSINT групи (InformNapalm, МЦНС)
- Правозахисні організації (Human Rights Watch UA, УГСПЛ)
- Спецпідрозділи ЗСУ / СБУ (через посередника)
- Міжнародні трибунали (ICC, Eurojust)

**Ціноутворення:**
```
База даних (167k records) — $5,000–15,000 одноразово
Платформа (ліцензія) — $3,000–8,000 + setup
Разом з VPS і підтримкою — $10,000–25,000
```

**Що продається:**
1. База даних осіб (SQL dump + структура)
2. Платформа (Source code або hosted instance)
3. VPS сервіси (Python scraping suite)
4. 30 днів технічної підтримки

---

### Модель 2 — SaaS підписка (довгострокова)

```
Basic  — $299/міс — 1 user, 10k records, базові реєстри
Pro    — $799/міс — 5 users, unlimited records, всі модулі
Team   — $1,999/міс — 20 users, API доступ, priority support
Enterprise — від $5,000/міс — custom, on-premise, SLA
```

**Ключові переваги SaaS:**
- Оновлення бази щомісяця
- Нові модулі автоматично
- Хмарний доступ з будь-якого місця
- Немає технічних проблем для покупця

---

### Модель 3 — Grant / Donor funded (для НКО)

**Доноры:**
- USAID, EU, NED (National Endowment for Democracy)
- Open Society Foundation
- Atlantic Council DFRLab
- Omidyar Network

**Підхід:**
- Позиціонувати як tool for accountability/transitional justice
- Open source core + commercial support
- Impact metrics: злочинців задокументовано, справ в ICC, медіа публікацій

---

### Модель 4 — Консалтинг / OSINT-as-a-Service

```
Разова перевірка особи (OSINT report) — $100–500/особа
Пакет 10 перевірок — $800
Пакет 50 перевірок — $3,000
Місячний retainer — $2,000–5,000/міс
```

---

## ПРЕЗЕНТАЦІЙНІ ТЕЗІСИ ДЛЯ ПОКУПЦЯ

### Проблема
> Розслідувачі та правозахисники витрачають 80% часу на збір даних з десятків розрізнених джерел. Жоден інструмент не поєднує Telegram Intelligence, українські реєстри та документацію воєнних злочинів.

### Рішення
> ODB Platform — перша в Україні OSINT платформа з фокусом на ідентифікацію учасників воєнних злочинів. 20+ джерел. 167,000 профілів. Telegram Intelligence. AI аналіз. Все в одному інтерфейсі.

### Ключові цифри
- **167,000+** задокументованих осіб
- **20+** джерел збагачення
- **6** мікросервісів реального часу
- **< 60 сек** від пошуку до повного OSINT звіту
- **3 мови** інтерфейсу

### Унікальні переваги
1. **Telegram Intelligence** — пошук за телефоном/іменем в реальному часі
2. **Зв'язки та граф** — хто з ким пов'язаний
3. **Voєнна специфіка** — звання, підрозділи, злочини, Миротворець
4. **Повний OSINT pipeline** — одна кнопка запускає 15+ перевірок
5. **Витоки** — інтеграція з базами даних витоків (МТС, Гослуслуги...)
6. **Звіти** — PDF досьє з усіма даними для суду/публікації

---

## ТЕХНІЧНИЙ БОРГ (що треба прибрати до продажу)

### Обов'язково
```
[ ] Видалити debug endpoints (/api/debug-env)
[ ] Приховати реальні ключі з коду (переконатись у .gitignore)  
[ ] Додати rate limiting на всі публічні endpoints
[ ] Замінити hardcoded VPS IP на env variable (вже є, перевірити)
[ ] Видалити тестові записи з БД
[ ] Додати HTTPS (Let's Encrypt) для VPS публічного доступу
```

### Бажано
```
[ ] TypeScript strict mode (прибрати any)
[ ] Error boundaries у React компонентах
[ ] Loading states для всіх асинхронних операцій
[ ] Mobile responsive (зараз тільки desktop)
[ ] Pagination для великих таблиць
[ ] Input validation на всіх формах
```

---

## ОЦІНКА РИЗИКІВ

| Ризик | Ймовірність | Вплив | Мітигація |
|---|---|---|---|
| VPS RAM overflow | Середня | Високий | Upgrade до 2GB |
| Telegram сесія блокується | Середня | Середній | Backup session + 2FA |
| Instagram/TikTok API зміни | Висока | Низький | Fallback scraping |
| НАЗК API недоступний | Низька | Середній | Cache результатів |
| Supabase outage | Дуже низька | Критичний | PG backup |
| VK token expire | Висока | Низький | Auto-refresh |
| ERB/MVS блок IP | Висока | Середній | UA proxy або перенести на Next.js |

---

## МЕТРИКИ УСПІХУ

### Технічні
- Uptime VPS: > 99%
- Response time OSINT: < 10s
- Покриття реєстрів: 15+ активних модулів
- Leaks records: > 1M записів

### Бізнесові
- Перший продаж: < 30 днів
- MRR (SaaS): $3,000+ за 6 місяців  
- Публікації в медіа: 3+ розслідувань з використанням ODB
- Partners: 2+ журналістські організації

---
*ODB Platform · Confidential · For authorized use only*
