# ODB Platform — Технічний паспорт v2.0
> Оперативна База Даних · Дата оновлення: 09.06.2026

---

## 1. ЗАГАЛЬНИЙ ОПИС

**ODB Platform** — спеціалізована OSINT/HUMINT платформа для документування воєнних злочинів, встановлення особистостей та крипто-форензики. Агрегує дані з 20+ джерел у єдиний профіль особи з автоматичним збагаченням та AI-аналізом.

| Параметр | Значення |
|---|---|
| Назва | ODB Platform (Оперативна База Даних) |
| Версія | Phase 2 (активна розробка) |
| Статус | Робочий — Production на Vercel |
| Prod URL | https://odb-one.vercel.app |
| Prod Domain | https://evidencebases.com |
| Мова інтерфейсу | UA |
| Записів у БД | **539,747 осіб** (після дедуплікації 2026-06-05) |
| Дата останнього коміту | 09.06.2026 |
| Остання PR | PR #29 — AI Profile fix (в review) |

---

## 2. ТЕХНІЧНИЙ СТЕК

### Frontend (Vercel Hobby)
| Компонент | Версія | Призначення |
|---|---|---|
| **Next.js** | 16 | App Router, SSR, API Routes |
| **React** | 19 | UI компоненти |
| **Tailwind CSS** | 3.x | Стилізація |
| **Supabase JS** | 2.x | Auth + DB client |
| **TypeScript** | 5.x | 0 помилок |

> Vercel Hobby: ліміт 60s на функцію, 1 cron/день. Для довгих операцій — VPS Orchestrator.

### Backend — Cloud DB
| Компонент | Деталі |
|---|---|
| **Supabase** | PostgreSQL 15, EU region |
| URL | `zvvtldyxmjuzpyozneoo.supabase.co` |
| Таблиці | `persons`, `incidents`, `incident_persons`, `evidence`, `connections`, `person_mentions` |
| Записів | 539,747 осіб (ЗС РФ, Wagner, 656 ПОН, ЦВО, 64 ОМБр та ін.) |
| RLS | Увімкнений (auth required) |
| Індекси | pg_trgm на name/name_rus, GIN на phones[], btree на created_at |

### Backend — VPS Мікросервіси
| Порт | Сервіс | Статус | Опис |
|---|---|---|---|
| **:8001** | odb-telegram | ACTIVE | Telegram bots, MTProto, Leak bots |
| **:8005** | odb-social | ACTIVE | Instagram/username search |
| **:8006** | odb-registries | ACTIVE | Myrotvorets, MVS, NumBuster, Truecaller, IPN, ERB |
| **:8008** | odb-telethon | ACTIVE | MTProto phone/name lookup |
| **:8011** | odb-orchestrator | ACTIVE | Async job queue, multi-source aggregation |

### Infrastructure
| Параметр | Значення |
|---|---|
| VPS Provider | DigitalOcean AMS3 |
| IP | `161.35.86.145` |
| Domain | evidencebases.com (Let's Encrypt SSL) |
| SSH | `ssh -i ~/.ssh/id_odb root@161.35.86.145` (alias: `vps`) |
| OS | Ubuntu 22.04.5 LTS |
| RAM | 957 MB total, ~371 MB used (після cleanup 09.06.2026) |
| Swap | 2 GB, ~811 MB used |
| Disk | 25 GB, 16 GB used (67%) |
| Process Manager | systemd |
| Reverse Proxy | nginx + HTTPS (UFW: тільки 80/443 відкриті) |

### VPS nginx маршрути
```
https://evidencebases.com/odb-api/            -> localhost:8011 (orchestrator)
https://evidencebases.com/odb-api/telethon/   -> localhost:8008
https://evidencebases.com/odb-api/presence/   -> localhost:8001
https://evidencebases.com/odb-api/regs/       -> localhost:8006
https://evidencebases.com/odb-api/social-vps/ -> localhost:8005
```

### VPS Cron
| Розклад | Скрипт | Дія |
|---|---|---|
| Кожні 5 хв | `/opt/odb/health_monitor.sh` | Health check + auto-restart + Telegram алерт |
| Кожні 30 хв | `/opt/odb/kill_zombie_chrome.sh` | Kill Chrome старших 2 год |

---

## 3. СТРУКТУРА БАЗИ ДАНИХ

### Таблиця `persons` (539,747 записів)
```sql
id              UUID PRIMARY KEY
name_ukr        TEXT    -- ПІБ українською
name_rus        TEXT    -- ПІБ російською
name_eng        TEXT    -- ПІБ англійською
dob             DATE
gender          TEXT
nationality     TEXT
region          TEXT
status          TEXT    -- active/deceased/unknown/wanted
rank            TEXT    -- Військове звання
position        TEXT
unit            TEXT    -- Підрозділ
unit_num        TEXT    -- Номер в/ч
military_id     TEXT    -- Особистий номер
ipn             TEXT    -- ІПН/ІНН
snils           TEXT    -- СНІЛС (РФ)
inn_ru          TEXT
passport        TEXT
addr_reg        TEXT
addr_live       TEXT
phones          TEXT[]  -- Масив телефонів (GIN індекс)
email           TEXT
photo_url       TEXT
myrotvorets_url TEXT
vk_url          TEXT
telegram_username TEXT
threat_score    INT     -- 0-100, AI-рейтинг
threat_level    TEXT    -- критичний/високий/середній/низький
ai_profile      TEXT    -- AI-профіль (JSON, claude-sonnet-4-6)
last_full_osint TIMESTAMPTZ
telegram_raw    JSONB
social_profiles JSONB
description     TEXT
notes           TEXT
analyst_notes   TEXT
sources         TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### Таблиця `incidents`
```sql
id, title, inc_type, date, location, description,
severity TEXT, icc_article TEXT, source TEXT
```

### Таблиця `incident_persons`
```sql
id, incident_id UUID, person_id UUID, role TEXT
```

### Таблиця `evidence`
```sql
id, person_id UUID, ev_type TEXT, file_url TEXT, description TEXT
```

### Таблиця `connections`
```sql
id, person_a_id UUID, person_b_id UUID, rel_type TEXT, strength INT
```

---

## 4. API МАРШРУТИ (93 route файли)

### Особи
| Метод | Шлях | Опис |
|---|---|---|
| GET/POST | `/api/persons` | Список / створення |
| GET/PATCH | `/api/persons/[id]` | Профіль / оновлення |
| GET | `/api/persons/[id]/connections` | Зв'язки |
| POST | `/api/persons/[id]/enrich` | OSINT збагачення |
| GET | `/api/persons/[id]/report` | Дані для PDF |

### Пошук
| Метод | Шлях | Опис |
|---|---|---|
| GET/POST | `/api/search` | Пошук по persons |
| POST | `/api/search/fragments` | Пошук за фрагментами |
| POST | `/api/search/unified` | 19 джерел паралельно (SSE stream) |
| POST | `/api/search-all` | SSE stream, всі джерела |

### Phone Intelligence
| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/phone-check` | carrier_info + Telegram + links |

### Breach Intelligence
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/breach/search` | Unified breach search |
| GET/POST | `/api/leaks` | LeakOsint пошук |

### Реєстри (-> VPS :8006)
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/erb/search` | ЄРБ боржники |
| POST | `/api/mvs/search` | МВС розшук |
| POST | `/api/myrotvorets/search` | Миротворець |
| POST | `/api/nazk/search` | НАЗК декларації |

### OSINT
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/osint/ai-profile/[id]` | AI профіль (claude-sonnet-4-6 + prompt cache) |
| POST | `/api/osint/sherlock-bot/[id]` | Sherlock username OSINT |
| POST | `/api/osint/telegram-phone/[id]` | TG по особі |
| POST | `/api/osint/vk/[id]` | VK пошук |
| POST | `/api/osint/instagram/[id]` | Instagram |
| POST | `/api/osint/search/[id]` | Web OSINT (Serper/Tavily) |
| POST | `/api/osint/findface/[id]` | FindFace |

### VPS Proxy
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/vps` | -> orchestrator :8011 |
| GET | `/api/vps/jobs` | Poll async job |

### Telegram Bot
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/telegram/webhook` | /status /watchlist /add /pause /resume |
| POST | `/api/cron/monitor` | Watchlist scanner (cron-job.org кожні 15 хв) |

### Інші
| Метод | Шлях | Опис |
|---|---|---|
| GET/POST | `/api/incidents` | Воєнні злочини |
| GET | `/api/company/search` | Бізнес-розвідка ЄДР |
| GET | `/api/shodan` | Shodan/IP/WHOIS/DNS |
| GET | `/api/sanctions/search` | РНБО/OFAC/EU (score >= 0.5) |

---

## 5. СТОРІНКИ ПЛАТФОРМИ

| Шлях | Назва | Статус |
|---|---|---|
| `/dashboard` | Дашборд — unified search | OK |
| `/persons` | Список осіб (539k) | OK |
| `/persons/new` | Додати особу | OK |
| `/persons/[id]` | Профіль особи (10 вкладок) | OK |
| `/persons/[id]/report` | PDF звіт | OK |
| `/incidents` | Воєнні злочини | OK |
| `/breach-intel` | Breach Intelligence | OK (PR#26) |
| `/crypto-intel` | Крипто форензика | OK |
| `/crypto-intel/watchlist` | Whale Alert watchlist | OK |
| `/network-intel` | Network/IP/WHOIS/DNS | OK |
| `/company-search` | Бізнес-розвідка | OK |
| `/fragment-search` | Пошук за фрагментами | OK |
| `/nazk-search` | НАЗК декларації | OK |
| `/phone-search` | Phone Intelligence | OK |
| `/spiderfoot` | SpiderFoot OSINT | OK |
| `/admin/enrich` | Збагачення | OK |
| `/admin/batch` | Масовий OSINT | OK |
| `/admin/import` | Імпорт даних | OK |
| `/login` | Вхід | OK |

### Вкладки профілю особи — 10 вкладок
| # | Вкладка | Зміст |
|---|---|---|
| 1 | Огляд | Threat Score, AI Summary, докази, quick stats |
| 2 | Зв'язки | Граф (Cytoscape) |
| 3 | Злочини | Інциденти + ICC статті |
| 4 | Реєстри | НАЗК, Миротворець, ЄРБ, МВС, Санкції |
| 5 | Медіа | Фото, відео |
| 6 | Документи | OSINT PDFs + Evidence uploader |
| 7 | В/Ч та техніка | Підрозділ, транспорт |
| 8 | Крипто | Гаманці, транзакції |
| 9 | OSINT | Web, OsintKit, LeakOsint, Sherlock Bot |
| 10 | Нотатки | Аналітичні нотатки |

---

## 6. БЕЗПЕКА

| Захід | Статус | PR |
|---|---|---|
| VPS UFW (тільки 80/443) | OK | #23 |
| nginx HTTPS proxy | OK | #23 |
| Видалено /api/debug-env та /api/debug-osint | OK | #27 |
| Rate limiting 20 req/хв GET, 10 req/хв POST | OK | #28 |
| Supabase RLS | OK | — |
| TELEGRAM_BOT_TOKEN rotated | OK | 08.06.2026 |

---

## 7. TELEGRAM BOT

| Параметр | Значення |
|---|---|
| Bot | @odb_osint_monitor_bot |
| Chat ID | 449967665 (vmak0001) |
| Webhook | https://odb-one.vercel.app/api/telegram/webhook |
| Cron | cron-job.org -> кожні 15 хв -> /api/cron/monitor |
| Команди | /status /watchlist /add /pause /resume |
| Алерти | Whale Alert (крипто) + VPS Health Monitor |

---

## 8. API КЛЮЧІ

| Сервіс | Статус | Примітка |
|---|---|---|
| Supabase | Active | |
| Anthropic | Active | claude-sonnet-4-6 |
| OsintKit | Active | 731 RU БД |
| LeakOsint | Active | ЗАКІНЧУЄТЬСЯ ~2026-07-05 |
| Serper | Active | |
| Tavily | Active | |
| DeHashed | Active | |
| HIBP | Active | |
| VK API | NOT SET | vk.com/dev |
| Google CSE | NOT SET | |

---

## 9. ІМПОРТОВАНІ ДАНІ

| Датасет | Записів | Статус |
|---|---|---|
| ЗС РФ реєстр | ~400k | Імпортовано |
| Wagner Group | ~5k | Імпортовано |
| 656 ПОН | ~2k | Імпортовано |
| ЦВО телефони | ~3k | Імпортовано |
| 64 ОМБр | ~1k | Імпортовано |
| Zona.media | ~22k | Імпортовано (є ~22k дублів — dedup pending) |
| Члени громадської палати | — | НЕ імпортовано |
| Главное управление связи ВС РФ | — | НЕ імпортовано |
| ПОВНИЙ СПИСОК.xlsx | — | Файл не знайдено |
| Военная полиция.xlsx | — | Немає структури |

---

## 10. ХРОНОЛОГІЯ PR

| PR | Дата | Опис |
|---|---|---|
| #7-11 | до 06.2026 | Timeouts, orchestrator, Telegram async, sanctions |
| #12-18 | до 06.2026 | Crypto module, DOCX, Russian entities |
| #22 | до 06.2026 | Telegram bot — inline keyboard, wallet balance |
| #23 | 08.06.2026 | Person page -> компоненти (5037 рядків) + VPS HTTPS |
| #24 | 08.06.2026 | Phone enrichment pipeline — nginx + carrier detection |
| #25 | 09.06.2026 | Sherlock Bot на OSINT tab |
| #26 | 09.06.2026 | Unified Search — /breach-intel, 19 джерел |
| #27 | 09.06.2026 | Security — видалено debug endpoints |
| #28 | 09.06.2026 | Rate limiting — 20/10 req/хв |
| #29 | 09.06.2026 | AI Profile — fix model + prompt caching + full card (в review) |

---

## 11. ВІДОМІ ПРОБЛЕМИ

| Проблема | Критичність | Дія |
|---|---|---|
| LeakOsint ключ exp ~2026-07-05 | HIGH | Поновити на leakosint.com |
| VPS RAM 957MB (рекомендовано 2GB) | MEDIUM | DigitalOcean -> Resize |
| TELEGRAM_BOT_TOKEN відсутній у cron | MEDIUM | SSH -> /etc/environment |
| VK API token не налаштований | MEDIUM | vk.com/dev |
| ~22k дублів zona.media | MEDIUM | dedup_safe.py готовий |
| Google CSE не налаштований | LOW | GOOGLE_CSE_CX + GOOGLE_API_KEY |
| Члени громадської палати не імпортовано | LOW | Фаза 2 |

---

## 12. ROADMAP

### Фаза 1 — Стабілізація (95% done)
- [x] VPS HTTPS nginx
- [x] UFW firewall (тільки 80/443)
- [x] Debug endpoints removed
- [x] Rate limiting
- [x] Person page -> компоненти
- [x] Phone enrichment pipeline
- [x] Telegram bot webhook
- [x] Zombie Chrome cron + Health monitor cron
- [ ] Dedup zona.media ~22k

### Фаза 2 — Розширення (поточна)
- [x] Unified Search (breach-intel)
- [x] Sherlock Bot
- [x] AI Profile fix (claude-sonnet-4-6, prompt caching)
- [ ] VK API token
- [ ] Whale Alert підписка (монетизація)
- [ ] Імпорт .doc/.docx (чиновники РФ)

### Фаза 3 — AI-асистент
- [ ] AI зв'язки між особами (один телефон = дві особи)
- [ ] AI Alert Analysis (Telegram бот пояснює транзакцію)
- [ ] Auto AI Profile при першому завантаженні особи

### Фаза 4 — Масштабування / Монетизація
- [ ] Vercel Pro + Supabase Pro (прибрати ліміт 60s)
- [ ] Multi-user (ролі: аналітик / слідчий / адмін)
- [ ] Stripe білінг MVP

### Фаза 5 — Продукт (конкурент Pandora)
- [ ] Mobile PWA
- [ ] Chrome Extension
- [ ] Публічний API (платний)
- [ ] Стандартизовані звіти для СБУ/НПУ

---

## 13. МОНЕТИЗАЦІЯ

| Продукт | Час до ринку | Ціна |
|---|---|---|
| Whale Alert Subscription | 1-2 тижні | $50-200/міс |
| Разові DOCX звіти | Зараз | Per-report |
| API для юридичних фірм | 2-4 тижні | Pay-per-query |
| B2B ліцензія НГО/журналісти | 1 місяць | Грант |

---

## 14. КОНКУРЕНТИ

| Конкурент | Ціна | Порівняння |
|---|---|---|
| Maltego | $999-5000/рік | Зв'язки, без UA специфіки |
| Social Links | $2000+/міс | TG + VK, без воєнних злочинів |
| Pandora | невідомо | 3B+ записів — найближчий конкурент |
| Orbis (Moody's) | $5000+/міс | KYC/AML корпоративний |
| **ODB Platform** | **Унікальна** | UA + воєнні злочини + Crypto + AI + 539k записів |
