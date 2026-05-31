# ODB Platform — Технічний паспорт v1.1
> Оперативна База Даних · Дата: 22.05.2026

---

## 1. ЗАГАЛЬНИЙ ОПИС

**ODB Platform** — спеціалізована OSINT/HUMINT платформа для документування воєнних злочинів, встановлення особистостей та проведення розвідувальних досліджень. Система агрегує дані з 20+ джерел у єдиний профіль особи з автоматичним збагаченням.

| Параметр | Значення |
|---|---|
| Назва | ODB Platform (Оперативна База Даних) |
| Версія | Phase 3 (MVP-ready) |
| Статус | Робочий прототип / Pre-sale ready |
| Мова інтерфейсу | 🇺🇦 UA · 🇬🇧 EN · 🇷🇺 RU |
| Записів у БД | 167,000+ осіб |
| Дата останнього коміту | 21.05.2026 |

---

## 2. ТЕХНІЧНИЙ СТЕК

### Frontend (Windows / локальний сервер)
| Компонент | Версія | Призначення |
|---|---|---|
| **Next.js** | 16.2.6 | App Router, SSR, API Routes |
| **React** | 19.2.4 | UI компоненти |
| **Tailwind CSS** | 3.x | Стилізація |
| **next-intl** | 4.12.0 | Мультимовність |
| **Supabase JS** | 2.x | Auth + Realtime |

### Backend — Cloud DB
| Компонент | Деталі |
|---|---|
| **Supabase** | PostgreSQL 15, hosted EU |
| URL | `zvvtldyxmjuzpyozneoo.supabase.co` |
| Таблиці | `persons`, `person_mentions`, `social_profiles`, `incidents`, `connections` |
| RLS | Увімкнений (auth required) |

### Backend — VPS Мікросервіси
| Порт | Сервіс | Файл | Статус |
|---|---|---|---|
| **8001** | Telegram Search + Leaks DB | `telegram_search.py` | ✅ ACTIVE |
| **8002** | Kadaster Scraper | `kadaster_scraper.js` | ✅ ACTIVE |
| **8003** | VPN Search | `vpn_search.py` | ✅ ACTIVE |
| **8004** | FindFace Scraper | `findface_scraper.py` | ✅ ACTIVE |
| **8005** | Social Search | `social_search.py` | ✅ ACTIVE |
| **8006** | Registries | `registries.py` | ✅ ACTIVE |

### Infrastructure
| Параметр | Значення |
|---|---|
| VPS Provider | DigitalOcean |
| IP | `161.35.86.145` |
| OS | Ubuntu 22.04.5 LTS |
| RAM | 1 GB (614MB used) |
| Disk | 25 GB (13 GB used, 52%) |
| Uptime | 23 дні без перезавантажень |
| Process Manager | systemd |
| Leaks PostgreSQL | `odb_leaks` DB, user `odb` |

---

## 3. СТРУКТУРА БАЗИ ДАНИХ

### Таблиця `persons` (167k+ записів)
```sql
id              UUID PRIMARY KEY
name_ukr        TEXT    -- ПІБ українською
name_rus        TEXT    -- ПІБ російською
name_eng        TEXT    -- ПІБ англійською
dob             DATE    -- Дата народження
gender          TEXT
birth_place     TEXT
nationality     TEXT
region          TEXT
status          TEXT    -- active/deceased/unknown/wanted
rank            TEXT    -- Військове звання
position        TEXT    -- Посада
unit            TEXT    -- Підрозділ
unit_num        TEXT    -- Номер в/ч
military_id     TEXT    -- Особистий номер
ipn             TEXT    -- ІПН/ІНН
snils           TEXT    -- СНІЛС (РФ)
passport        TEXT    -- Паспортні дані
addr_reg        TEXT    -- Адреса реєстрації
phones          TEXT[]  -- Масив телефонів
email           TEXT
photo_url       TEXT
myrotvorets_url TEXT
threat_score    INT     -- 0-100, AI-рейтинг загрози
ai_profile      TEXT    -- AI-згенерований профіль
telegram_raw    JSONB   -- Результати Telegram OSINT
telegram_accounts JSONB -- Знайдені TG акаунти
social_profiles JSONB   -- VK, Instagram тощо
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### Таблиця `incidents` (воєнні злочини)
```sql
id, title, inc_type, date, location, description,
person_ids UUID[], evidence JSONB, source TEXT
```

### Таблиця `connections` (зв'язки між особами)
```sql
id, person_a_id, person_b_id, 
connection_type TEXT, strength INT, notes TEXT
```

### Leaks DB — `odb_leaks.leaks` (VPS PostgreSQL)
```sql
id, phone, email, name, dob, inn, snils, 
passport, address, vk_id, source, raw JSONB
```
> ⚠️ Поточний стан: 0 записів (порожня, готова до заповнення)

### Leaks DB — `odb_leaks.known_breaches` (VPS PostgreSQL)
```sql
id, dump_name, breach_date, record_count, source, info, imported_at
```
> ✅ **181,403 записів** з known-breaches (HackNotice, DeHashed, Cit0day, WeLeakInfo, DataViper та ін.)
> Оновлення: щодня о 03:00 UTC через cron `/opt/known-breaches/update_catalog.sh`

---

## 4. API МАРШРУТИ (Next.js)

### Особи
| Метод | Шлях | Опис |
|---|---|---|
| GET/POST | `/api/persons` | Список / створення |
| GET/PUT | `/api/persons/[id]` | Профіль / оновлення |
| GET | `/api/persons/[id]/connections` | Зв'язки |
| POST | `/api/persons/[id]/enrich` | Збагачення OSINT |
| GET | `/api/persons/[id]/report` | Дані для PDF |
| POST | `/api/persons/bulk-enrich` | Масове збагачення |

### Пошук
| Метод | Шлях | Опис |
|---|---|---|
| GET/POST | `/api/search` | Основний пошук |
| POST | `/api/search/fragments` | Пошук за крихтами |

### Реєстри (проксі → VPS :8006)
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/erb/search` | ЄРБ боржники |
| POST | `/api/mvs/search` | МВС розшук |
| POST | `/api/myrotvorets/search` | Миротворець |
| POST | `/api/nazk/search` | НАЗК декларації |
| GET | `/api/nazk/document` | Повна декларація |

### Витоки (проксі → VPS :8001)
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/leaks` | Пошук у витоках |
| GET | `/api/leaks` | Статистика витоків |
| POST | `/api/leaks/import` | Імпорт CSV батчами |

### OSINT (проксі → VPS)
| Метод | Шлях | Опис |
|---|---|---|
| POST | `/api/osint/telegram-phone/[id]` | TG по особі |
| POST | `/api/osint/telegram-phone/direct` | TG по телефону |
| POST | `/api/osint/social-all/[id]` | Соцмережі |
| POST | `/api/osint/findface/[id]` | FindFace |
| POST | `/api/osint/getcontact/[id]` | GetContact |
| POST | `/api/osint/vk/[id]` | VK пошук |
| POST | `/api/osint/instagram/[id]` | Instagram |
| POST | `/api/osint/tiktok/[id]` | TikTok |
| POST | `/api/osint/kadaster/[id]` | Кадастр |
| POST | `/api/osint/vehicles/[id]` | Транспорт |
| POST | `/api/osint/ai-profile/[id]` | AI профіль |
| POST | `/api/osint/batch` | Масовий OSINT |

### Інші
| Метод | Шлях | Опис |
|---|---|---|
| GET/POST | `/api/incidents` | Воєнні злочини |
| POST | `/api/social/search` | Соцмережі прямо |
| POST | `/api/telegram/search` | Telegram пошук |

---

## 5. СТОРІНКИ ПЛАТФОРМИ

| Шлях | Назва | Статус |
|---|---|---|
| `/dashboard` | Дашборд | ✅ |
| `/persons` | Список осіб (167k) | ✅ |
| `/persons/new` | Додати особу | ✅ |
| `/persons/[id]` | Профіль особи | ✅ (7 вкладок) |
| `/persons/[id]/report` | PDF звіт | ✅ |
| `/incidents` | Воєнні злочини | ✅ |
| `/fragment-search` | Пошук за крихтами | ✅ |
| `/social-search` | Соцмережі OSINT | ✅ |
| `/nazk-search` | Пошук по НАЗК | ✅ |
| `/phone-search` | Пошук по ідентифікатору | ✅ NEW |
| `/registries` | Реєстри (огляд) | ✅ |
| `/admin/enrich` | Збагачення | ✅ |
| `/admin/batch` | Масовий OSINT | ✅ |
| `/admin/leaks-import` | Імпорт витоків | ✅ NEW |
| `/breach-intel` | Breach Intelligence (2 вкладки) | ✅ NEW |
| `/network-intel` | Network/IP/WHOIS/DNS/CVE | ✅ NEW |
| `/company-search` | Бізнес-розвідка YouControl/ЄДР | ✅ NEW |
| `/spiderfoot` | SpiderFoot OSINT Framework | ✅ NEW |
| `/login` | Вхід | ✅ |

### Вкладки профілю особи (`/persons/[id]`)
1. **Overview** — hero block з Threat Score, AI summary
2. **OSINT** — збагачення з усіх джерел
3. **Реєстри** 🆕 — НАЗК, Миротворець, ЄРБ, МВС
4. **Зв'язки** — граф зв'язків (D3.js)
5. **Злочини** — пов'язані інциденти
6. **Медіа** — фото, відео
7. **Системно** — метадані

---

## 6. VPS СЕРВІСИ — ДЕТАЛЬНІ ENDPOINTS

### :8001 Telegram Search + Leaks + SpiderFoot proxy
```
GET  /health               — статус
GET  /search               — TG пошук за ім'ям (query param)
POST /search/phone         — TG акаунт за телефоном
POST /search/tg-user       — TG акаунти за ім'ям
POST /search/face          — Пошук за фото (FindFace)
POST /leaks/search         — Пошук у витоках (odb_leaks.leaks)
POST /leaks/import         — Імпорт записів (batch up to 10k)
GET  /leaks/stats          — Статистика leaks DB
GET  /breaches/search?q=   — Пошук по каталогу 181k витоків
GET  /breaches/stats       — Статистика каталогу known-breaches
GET  /sf/*                 — Proxy → SpiderFoot 4.0.0 :8007
```

### :8002 Kadaster (Puppeteer)
```
GET  /health                 — статус
POST /search/kadaster        — Пошук у hsc.gov.ua (ім'я+ДН)
```

### :8003 VPN Search
```
GET  /health      — статус
POST /vpn-search  — Пошук по VPN базах
```

### :8004 FindFace
```
GET  /health      — статус
POST /findface    — Розпізнавання обличчя (TelegramDB)
```

### :8005 Social Search
```
GET  /health              — статус
POST /social/instagram    — Instagram профіль
POST /social/tiktok       — TikTok профіль
POST /social/getcontact   — GetContact (потрібен токен)
POST /social/username     — Пошук за username
```

### :8006 Registries
```
GET  /health                    — статус
POST /registry/myrotvorets      — Миротворець
POST /registry/erb              — ЄРБ боржники
POST /registry/mvs/{resource}   — МВС (wanted/stolen_cars/...)
POST /registry/numbuster        — NumBuster (CallerID)
POST /registry/truecaller       — TrueCaller
POST /registry/ipn              — Пошук за ІПН
POST /registry/advocates        — Реєстр адвокатів
```

---

## 7. ТЕСТУВАННЯ — ЗВІТ BUGS & СТАТУС

### ✅ ТЕСТ 22.05.2026 — 9/9 VPS+API ПРОЙШЛИ

| Endpoint | Статус | Info |
|---|---|---|
| VPS /health | ✅ 200 | `{'status': 'ok'}` |
| VPS /breaches/stats | ✅ 200 | 181,403 записів у каталозі |
| VPS /leaks/stats | ✅ 200 | 0 особистих записів (порожня) |
| VPS SpiderFoot ping | ✅ 200 | `['SUCCESS', '4.0.0']` |
| API /breach/catalog stats | ✅ 200 | catalog_total: 181403 |
| API /breach/catalog?q=vk | ✅ 200 | total: 156 витоків VK |
| API /company/search GET | ✅ 200 | edr_free: true, fop_free: true |
| API /shodan GET | ✅ 200 | geo: true, rdap: true |
| API /spiderfoot GET | ✅ 200 | available: true |

### ✅ ТЕСТ 21.05.2026 — 8/8 API ПРОЙШЛИ (Python UTF-8)
| Endpoint | Час | Результат |
|---|---|---|
| GET `/api/persons` | 2553ms | 167,523 записів |
| POST `/api/search/fragments` | 528ms | OK |
| POST `/api/nazk/search` | 427ms | found=10/65 (Кличко) |
| POST `/api/erb/search` | 275ms | OK (0 боржників) |
| POST `/api/myrotvorets/search` | 520ms | found=15 (Стрелков) |
| POST `/api/leaks` | 142ms | OK (DB порожня) |
| POST `/api/leaks/import` | 137ms | inserted=1 ✓ |
| POST `/api/osint/telegram-phone/direct` | 3206ms | OK (номер не знайдено) |

### ✅ ПРАЦЮЄ КОРЕКТНО
| Функція | Статус | Примітка |
|---|---|---|
| Auth (Supabase) | ✅ | JWT, email/password |
| Список осіб + пагінація | ✅ | 167,523 записів |
| Пошук по базі | ✅ | ПІБ, телефон, ІПН |
| Профіль особи | ✅ | 7 вкладок |
| НАЗК декларації | ✅ | found=10, total=65 (тест Кличко) |
| Миротворець | ✅ | found=15 (тест Стрелков) |
| ЄРБ боржники | ✅ | API доступний, success=true |
| Telegram пошук | ✅ | Telethon, VPS :8001 |
| VPS :8001–:8006 | ✅ | Всі 6 сервісів активні |
| NumBuster | ✅ | Caller ID повертає дані |
| TikTok | ✅ | Публічні профілі |
| Leaks search API | ✅ | Endpoint готовий |
| Leaks import API | ✅ | Batch insert: inserted=1 |
| PDF звіт | ✅ | window.print() |
| AI профіль | ✅ | Claude (ключ є!) |
| Мультимовність | ✅ | UK/EN/RU |
| Зв'язки (граф) | ✅ | D3.js |
| Sidebar навігація | ✅ | Всі розділи |
| Phone/ID Search | ✅ | NEW — /phone-search |
| Leaks Import UI | ✅ | NEW — /admin/leaks-import |

### ⚠️ ЧАСТКОВО ПРАЦЮЄ / ПОТРЕБУЄ ТОКЕНИ
| Функція | Статус | Що потрібно |
|---|---|---|
| GetContact | ⚠️ `no_token` | `GETCONTACT_TOKEN` в `.env` на VPS |
| VK пошук | ⚠️ потрібен токен | `VK_ACCESS_TOKEN` в `.env.local` |
| Google CSE | ⚠️ не налаштований | `GOOGLE_CSE_CX` + `GOOGLE_API_KEY` |
| Instagram | ⚠️ HTTP 429 | Rate limit — потрібен проксі або пауза |
| FindFace | ⚠️ обмежений | Немає платного API ключа |
| AI профіль | ⚠️ немає ключа | `ANTHROPIC_API_KEY` в `.env.local` |

### ❌ ВІДОМІ БАГИ (після тестування 21.05.2026)
| Баг | Критичність | Опис | Статус |
|---|---|---|---|
| НАЗК curl 0 results | ✅ ЗАКРИТО | WSL curl ламає Cyrillic. З браузера/Python — ОК | Виправлено headers |
| Telegram crash loop | ✅ ЗАКРИТО | SQLite database is locked. Orphan processes | Виправлено через kill+restart |
| ERB/Myrotvorets 403 | ✅ N/A | 403 тільки з VPS (NL IP). Next.js (UA) — ОК | Архітектурно коректно |
| MVS data.gov.ua | 🟡 LOW | Блокує Netherlands IP. Fallback посилання є | Graceful fallback |
| Instagram 429 | 🟡 MEDIUM | Rate limit при частих запитах | Додати затримку |
| GetContact no_token | 🟡 MEDIUM | Токен не налаштований у VPS .env | Додати GETCONTACT_TOKEN |
| VK_ACCESS_TOKEN | 🟡 MEDIUM | Не налаштований у .env.local | Додати токен VK |
| Leaks personal records 0 | 🟡 MEDIUM | DB leaks.leaks порожня | Завантажити через /admin/leaks-import |
| VPS RAM 640/957 MB | 🟢 LOW | 67% + swap активний | Upgrade до 2GB рекомендовано |
| GOOGLE_CSE_CX | 🟢 LOW | Не налаштований | Додати для web OSINT |

### 🔧 ВИПРАВЛЕННЯ В ПРОЦЕСІ РОЗРОБКИ
- **НАЗК 0 результатів** — виявлено: WSL curl ламає Cyrillic encoding. Виправлено: додано browser User-Agent headers
- **Telegram crash loop** — виявлено: SQLite `database is locked`. Виправлено: kill orphans + clean journal
- **ERB/Myrotvorets з VPS** — потрібно перенести запити на Windows/Next.js (UA IP)

---

## 8. КОНФІГУРАЦІЯ ТА ЗМІННІ СЕРЕДОВИЩА

### `.env.local` (Windows, Next.js)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://zvvtldyxmjuzpyozneoo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
VPS_HOST=161.35.86.145
TELEGRAM_SEARCH_PORT=8001
SOCIAL_SEARCH_PORT=8005
REGISTRIES_PORT=8006

# Опціональні (для повного функціоналу)
ANTHROPIC_API_KEY=<key>        # AI профілі
GOOGLE_CSE_CX=<cx>             # Google OSINT пошук
GOOGLE_API_KEY=<key>           # Google CSE
VK_ACCESS_TOKEN=<token>        # VK пошук
TAVILY_API_KEY=<key>           # Web search

# Phase 3 — Intelligence Modules (NEW)
SHODAN_API_KEY=<key>           # Shodan — shodan.io/account ($49/рік)
DEHASHED_API_KEY=<key>         # DeHashed API — dehashed.com ($5.49/міс)
DEHASHED_EMAIL=<email>         # Email для DeHashed Basic auth
LEAKCHECK_API_KEY=<key>        # LeakCheck — leakcheck.io ($9/міс)
SNUSBASE_API_KEY=<key>         # SnusBase — snusbase.com ($6/міс)
YOUCONTROL_API_KEY=<key>       # YouControl — youcontrol.com.ua (~$50/міс)
OPENDATABOT_API_KEY=<key>      # Opendatabot — opendatabot.ua (~$30/міс)
```

### `/opt/odb/.env` (VPS)
```bash
ODB_API_KEY=<key>
ODB_TOKEN=<jwt>
SUPABASE_URL=<url>
SUPABASE_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
SUPABASE_SECRET_KEY=<key>
# Потрібно додати:
GETCONTACT_TOKEN=<token>       # GetContact API
TELEGRAM_SESSION=<session>     # Telethon session string
```

---

## 9. ВСТАНОВЛЕННЯ З НУЛЯ

### Вимоги
- Node.js 20+, npm 10+
- Python 3.10+
- PostgreSQL 14+ (для leaks DB)
- VPS Ubuntu 22.04+ (2GB RAM рекомендовано)
- Supabase акаунт

### Кроки встановлення

**1. Clone + Next.js**
```bash
git clone <repo> odb-platform
cd odb-platform
npm install
cp .env.example .env.local
# Заповнити змінні середовища
npm run dev         # http://localhost:3000
```

**2. Supabase**
```bash
# Запустити SQL schema з /supabase/migrations/
# Або підключити існуючий проект через SUPABASE_URL
```

**3. VPS — Python сервіси**
```bash
ssh root@<vps-ip>
mkdir -p /opt/odb
# Скопіювати скрипти: telegram_search.py, registries.py, social_search.py,
#                     vpn_search.py, findface_scraper.py, kadaster_scraper.js

pip3 install aiohttp telethon psycopg2-binary aiofiles
npm install -g puppeteer

# Налаштувати systemd (./systemd/*.service)
systemctl enable --now odb-telegram odb-registries odb-social odb-vpnsearch odb-findface odb-kadaster
```

**4. Leaks PostgreSQL (VPS)**
```bash
sudo -u postgres createdb odb_leaks
sudo -u postgres createuser odb
sudo -u postgres psql -c "ALTER USER odb PASSWORD 'odb_leaks_2026'"
sudo -u postgres psql odb_leaks -c "
  CREATE TABLE leaks (
    id SERIAL PRIMARY KEY,
    phone TEXT, email TEXT, name TEXT, dob TEXT,
    inn TEXT, snils TEXT, passport TEXT, address TEXT,
    vk_id TEXT, source TEXT DEFAULT 'unknown', raw JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX ON leaks(phone);
  CREATE INDEX ON leaks(inn);
  CREATE INDEX ON leaks(email);
  GRANT ALL ON TABLE leaks TO odb;
  GRANT USAGE, SELECT ON SEQUENCE leaks_id_seq TO odb;
"
```

**5. Telegram Session**
```bash
cd /opt/odb
python3 -c "from telethon.sync import TelegramClient; c = TelegramClient('odb_osint', API_ID, API_HASH); c.start(phone='+XXXXXXXXX')"
# Ввести код з SMS — файл odb_osint.session буде створено
```

---

## 10. ОЦІНКА ВАРТОСТІ / РИНКОВА ПОЗИЦІЯ

### Поточна функціональність
- 167,000+ профілів осіб у базі
- 20+ OSINT модулів
- 6 мікросервісів на VPS
- Мультимовний інтерфейс (UA/EN/RU)
- PDF генерація звітів
- Telegram Intelligence (Telethon)
- Аналіз зв'язків (граф)
- AI автоматичний профіль

### Аналоги на ринку
| Конкурент | Ціна | Порівняння |
|---|---|---|
| Maltego | $999-5000/рік | Аналіз зв'язків, без UA специфіки |
| Social Links | $2000+/міс | TG + VK OSINT, без воєнних злочинів |
| Orbis (Moody's) | $5000+/міс | KYC/AML, корпоративний |
| Shadowdragon | $10k+/рік | US DoD рівень |
| **ODB Platform** | **Унікальна** | UA специфіка + воєнні злочини + Telegram |

---
