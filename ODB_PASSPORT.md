# ODB Platform — Повний Паспорт Проекту
> Оновлено: 2026-06-03 | Версія: 0.1.0 | Статус: MVP у продакшені

---

## 1. ЗАГАЛЬНА ІНФОРМАЦІЯ

| Параметр | Значення |
|----------|----------|
| Назва | ODB Platform — Оперативна База Даних |
| Призначення | OSINT-платформа для документування воєнних злочинів |
| Стек | Next.js 16.2.6 + React 19 + Supabase + Python VPS |
| Мова інтерфейсу | UK / EN / RU (i18n) |
| Production URL | https://odb-one.vercel.app |
| Репозиторій | github.com/Valeriiy948/ODB (branch: main) |
| Хостинг | Vercel (Hobby plan) |
| База даних | Supabase PostgreSQL (zvvtldyxmjuzpyozneoo.supabase.co) |
| VPS | 161.35.86.145 (DigitalOcean, ssh alias: `vps`) |
| Записів у БД | ~389,000 осіб |
| Файлів коду | 128 TS/TSX + 10 Python |
| Рядків коду | ~24,500 TS/TSX + ~2,400 Python |
| Авторизація | Supabase Auth + middleware (email/password) |

---

## 2. АРХІТЕКТУРА

```
[Браузер] → [Vercel / Next.js] → [Supabase Cloud DB]
                                → [VPS 161.35.86.145]
                                   ├── :8001 telegram_search.py (бот-пошук)
                                   ├── :8005 social_search.py (соцмережі)
                                   ├── :8006 registries.py (реєстри)
                                   ├── :8008 telethon_service.py (MTProto)
                                   └── sanctions_service.py (санкції)
                                → [Зовнішні API]
                                   ├── OsintKit.io (731 RU баз)
                                   ├── LeakOsint.cc (800+ баз)
                                   ├── DeHashed.com
                                   ├── Tavily (веб-пошук)
                                   ├── Anthropic Claude (AI-профілі)
                                   ├── Serper (Google search)
                                   └── HIBP (Have I Been Pwned)
```

---

## 3. UI СТОРІНКИ (28 сторінок)

### ПОШУК
| Сторінка | URL | Статус | Опис |
|----------|-----|--------|------|
| Пошук по всіх джерелах | /search-all | ✅ Працює | Універсальний пошук: ПІБ, телефон, email, IP, username |
| Дашборд | /dashboard | ✅ Працює | Головна з пошуком + швидкі посилання |
| Фрагментний пошук | /fragment-search | ⚠️ UI є | Пошук по фрагментах даних |

### РОЗВІДКА
| Сторінка | URL | Статус | Опис |
|----------|-----|--------|------|
| Авто-слідчий (Agent) | /agent | ✅ Працює | AI-агент що автоматично розслідує особу |
| Картотека осіб | /persons | ✅ Працює | Список всіх осіб з фільтрами, пагінацією |
| Картка особи | /persons/[id] | ✅ Працює | Повне досьє: OSINT (33+ вкладки), зв'язки, медіа |
| PDF-досьє | /persons/[id]/report | ✅ Працює | Генерація PDF-звіту по особі |
| Додати особу | /persons/new | ✅ Працює | Форма створення нового запису |
| Справи (інциденти) | /incidents | ✅ Працює | Справи/злочини з прив'язкою до осіб |
| Телефон / ІПН | /phone-search | ✅ Працює | Пошук по телефону, GetContact, caller ID |
| Витоки даних | /breach-intel | ✅ Працює | Пошук по leak-базах: OsintKit, LeakOsint, DeHashed, HIBP |
| Бізнес-розвідка | /company-search | ✅ Працює | ЄДР, OpenDataBot, контрагенти |
| Мережева розвідка | /network-intel | ✅ Працює | IP/домен → Shodan, WHOIS, DNS |
| Крипто-розвідка | /crypto-intel | ✅ Працює | Крипто-гаманці, трейсинг, кластеризація |
| Соцмережі | /social-search | ✅ Працює | VK, Instagram, TikTok, Sherlock |
| Sherlock | /sherlock | ✅ Працює | Username OSINT по 300+ платформах |
| SpiderFoot | /spiderfoot | ⚠️ UI є | Інтеграція зі SpiderFoot (потрібен VPS) |

### РЕЄСТРИ
| Сторінка | URL | Статус | Опис |
|----------|-----|--------|------|
| Всі реєстри | /registries | ✅ Працює | Єдина точка входу: МВС, суди, ЄДР, НАЗК |
| НАЗК декларації | /nazk-search | ✅ Працює | Пошук по деклараціях чиновників |

### СИСТЕМА / АДМІН
| Сторінка | URL | Статус | Опис |
|----------|-----|--------|------|
| Імпорт осіб | /admin/import | ✅ Працює | CSV/Excel імпорт у базу |
| Імпорт витоків | /admin/leaks-import | ✅ Працює | Імпорт leak-баз (RosPasport, etc.) |
| Масовий OSINT (Batch) | /admin/batch | ✅ Працює | Масове збагачення записів |
| Збагачення | /admin/enrich | ✅ Працює | Ручне збагачення конкретної особи |
| Користувачі | /admin/users | ✅ Працює | Управління доступом |
| Активність | /admin/activity | ✅ Працює | Лог дій користувачів |
| Інструменти | /admin/tools | ✅ Працює | Утиліти адміністратора |
| Налаштування | /settings | ✅ Працює | API ключі, мова, тема |
| Логін | /login | ✅ Працює | Supabase Auth (email/password) |

---

## 4. API ENDPOINTS (78 маршрутів)

### Пошук
| Endpoint | Метод | Опис |
|----------|-------|------|
| /api/search | GET | Пошук осіб по імені (trigram) |
| /api/search-all | GET/POST | Універсальний пошук по всіх джерелах |
| /api/search/fragments | POST | Фрагментний пошук |

### Особи (Persons)
| Endpoint | Метод | Опис |
|----------|-------|------|
| /api/persons | GET/POST | CRUD список осіб, фільтри, пагінація |
| /api/persons/[id] | GET/PUT/DELETE | Конкретна особа |
| /api/persons/[id]/connections | GET/POST | Зв'язки між особами |
| /api/persons/[id]/enrich | POST | Збагачення конкретної особи |
| /api/persons/[id]/report | GET | PDF генерація |
| /api/persons/enrich | POST | Збагачення (OsintKit + LeakOsint) |
| /api/persons/bulk-enrich | POST | Масове збагачення |
| /api/persons/import | POST | Імпорт CSV/Excel |

### OSINT модулі (по особі)
| Endpoint | Опис | Зовнішній сервіс |
|----------|------|------------------|
| /api/osint/ai-profile/[id] | AI-аналіз профілю | Anthropic Claude |
| /api/osint/search/[id] | Веб-пошук | Tavily / Serper |
| /api/osint/batch | Масовий OSINT | Внутрішній |
| /api/osint/findface/[id] | Пошук по фото | FindFace (VPS) |
| /api/osint/search4faces/[id] | Пошук по обличчю | Search4Faces |
| /api/osint/getcontact/[id] | GetContact lookup | GetContact |
| /api/osint/instagram/[id] | Instagram OSINT | VPS scraper |
| /api/osint/tiktok/[id] | TikTok OSINT | VPS scraper |
| /api/osint/vk/[id] | VK OSINT | VK API (VPS) |
| /api/osint/telegram-phone/[id] | Telegram по телефону | Telethon (VPS) |
| /api/osint/phone-presence/[id] | Месенджер-детект | VPS |
| /api/osint/social-all/[id] | Всі соцмережі разом | Агрегатор |
| /api/osint/nazk/[id] | НАЗК декларації | НАЗК API |
| /api/osint/opendatabot/[id] | OpenDataBot | OpenDataBot API |
| /api/osint/kadaster/[id] | Кадастр нерухомості | VPS scraper |
| /api/osint/vehicles/[id] | Транспортні засоби | VPS |
| /api/osint/obituaries/[id] | Некрологи | Веб-пошук |
| /api/osint/photos/[id] | Фото-розвідка | Агрегатор |
| /api/osint/vpn-search/[id] | VPN/proxy детект | VPS |
| /api/osint/chimera | Chimera OSINT | Зовнішній |
| /api/osint/sherlock | Sherlock usernames | VPS |

### Витоки даних (Breach Intel)
| Endpoint | Опис |
|----------|------|
| /api/breach/search | Пошук по всіх leak-базах |
| /api/breach/profile | Повний breach-профіль особи |
| /api/breach/catalog | Каталог доступних баз |
| /api/breach/pivot | Pivot — зв'язки через витоки |
| /api/leaks/leakosint | LeakOsint API |
| /api/leaks | Загальний leak endpoint |
| /api/leaks/import | Імпорт leak-даних |

### Бізнес / Реєстри
| Endpoint | Опис |
|----------|------|
| /api/company/search | Пошук компаній (ЄДР) |
| /api/registries/[...path] | Проксі до реєстрів (VPS) |
| /api/nazk/search | НАЗК — пошук |
| /api/nazk/corruption | НАЗК — корупціонери |
| /api/nazk/lustration | НАЗК — люстрація |
| /api/nazk/document | НАЗК — документи |
| /api/erb/search | ЄДР бенефіціари |
| /api/fns/search | ФНС (Росія) |
| /api/court/search | Судові рішення |
| /api/mvs/search | МВС розшук |
| /api/sanctions/search | Санкційні списки |

### Телеком / Соцмережі
| Endpoint | Опис |
|----------|------|
| /api/telegram/search | Telegram пошук (бот) |
| /api/telegram/quick | Швидкий Telegram пошук |
| /api/telegram/enrich | Telegram збагачення |
| /api/getcontact/search | GetContact lookup |
| /api/social/search | Соцмережі агрегатор |
| /api/vk/search | VK пошук |
| /api/myrotvorets/search | Миротворець |
| /api/web/search | Веб-пошук |
| /api/shodan/search | Shodan (IP/IoT) |

### Крипто
| Endpoint | Опис |
|----------|------|
| /api/crypto/wallet | Аналіз гаманця |
| /api/crypto/trace | Трейсинг транзакцій |
| /api/crypto/cluster | Кластеризація адрес |
| /api/crypto/ai-report | AI-звіт по крипто |
| /api/crypto/link-person | Прив'язка гаманця до особи |
| /api/crypto/osint-bridge | OSINT ↔ Crypto міст |
| /api/crypto/search-persons | Пошук осіб по крипто |

### AI / Агент
| Endpoint | Опис |
|----------|------|
| /api/agent/investigate | AI-слідчий (автоматичне розслідування) |
| /api/network/ai-analyze | AI-аналіз мережі зв'язків |
| /api/network | Граф зв'язків |

### Система
| Endpoint | Опис |
|----------|------|
| /api/admin/users | Управління користувачами |
| /api/admin/migrate | Міграції БД |
| /api/activity/log | Лог активності |
| /api/activity/setup | Налаштування логування |
| /api/settings | Налаштування системи |
| /api/evidence/upload | Завантаження доказів |
| /api/evidence/[id] | Доказ (CRUD) |
| /api/evidence/view/[id] | Перегляд доказу |
| /api/connections/[id] | Зв'язок (CRUD) |
| /api/incidents | Справи (CRUD) |
| /api/incidents/[id] | Справа (CRUD) |
| /api/incidents/[id]/persons | Особи у справі |
| /api/spiderfoot/scan | SpiderFoot сканування |
| /api/debug-env | ❌ Вимкнено (безпека) |

---

## 5. VPS СЕРВІСИ (161.35.86.145)

| Порт | Сервіс | Файл | Статус |
|------|--------|------|--------|
| 8001 | Telegram Bot Search | telegram_search.py | ✅ Працює |
| 8005 | Social Search (VK, IG) | social_search.py | ⚠️ Потребує перевірки |
| 8006 | Registries Proxy | registries.py | ⚠️ Потребує перевірки |
| 8008 | Telethon MTProto | telethon_service.py | ❌ Auth pending (rate limit) |
| 8010 | Sanctions Service | sanctions_service.py | ❌ Не запущений |
| — | FindFace Scraper | findface_scraper.py | ❌ Скрипт є, сервіс ні |
| — | VK Proxy | vk_proxy.py | ❌ Потребує VK token |

---

## 6. ЗОВНІШНІ API — СТАТУС КЛЮЧІВ

| Сервіс | Статус | Примітки |
|--------|--------|----------|
| Supabase | ✅ Активний | Anon + Service Role keys |
| Anthropic Claude | ✅ Активний | AI-профілі, Agent |
| OsintKit.io | ✅ Активний | `filters[names]=ПІБ` формат |
| LeakOsint.cc | ✅ Активний | ~25 днів залишилось |
| DeHashed | ✅ Активний | Email/username/phone search |
| HIBP | ✅ Активний | Have I Been Pwned |
| Tavily | ✅ Активний | Веб-пошук |
| Serper | ✅ Активний | Google Search API |
| VK API | ❌ Не налаштований | Потрібен токен |
| Google CSE | ❌ Не налаштований | Custom Search Engine |
| GetContact | ⚠️ Обмежений | Потребує mobile API |
| SpiderFoot | ❌ Не інтегрований | Потрібен self-hosted |

---

## 7. БАЗА ДАНИХ

### Таблиці
| Таблиця | Записів | Опис |
|---------|---------|------|
| persons | ~389,000 | Основна таблиця осіб |
| connections | — | Зв'язки між особами |
| incidents | — | Справи/інциденти |
| evidence | — | Докази (файли) |
| activity_logs | — | Лог дій |

### Ключові поля persons
```
id, name, name_rus, name_ukr, name_eng, dob, nationality,
phones (text[]), email, address,
rank, unit, position,
photo_url, myrotvorets_url,
threat_score, verified, sources,
last_full_osint, osint_data (jsonb),
crypto_wallets (jsonb),
created_at, updated_at
```

### Індекси
- `pg_trgm` GIN на `name` — швидкий ILIKE пошук (~200ms)
- `pg_trgm` GIN на `name_rus`
- GIN на `phones` (text[] масив)
- B-tree на `created_at` DESC
- B-tree на `dob`

---

## 8. ENRICHER AGENT (Автозбагачення)

| Параметр | Значення |
|----------|----------|
| Скрипт | C:\Temp\odb_enricher_local.py |
| Режим | Локально (Windows) — VPS blocked by Cloudflare |
| Джерела | OsintKit + LeakOsint |
| Верифікація | Тільки якщо DOB співпадає (100% дані) |
| Пріоритет | Офіцери (з rank) → решта |
| Швидкість | 500 осіб/запуск, 12с між запитами |
| Статус | ⚠️ Може працювати в фоні |

---

## 9. ТЕХНІЧНИЙ БОРГ

| Проблема | Пріоритет | Опис |
|----------|-----------|------|
| person page.tsx 5000+ рядків | 🔴 Високий | Розбити на компоненти |
| strictNullChecks: false | 🟡 Середній | Тимчасово вимкнено для build |
| noImplicitAny: false | 🟡 Середній | Тимчасово вимкнено |
| middleware deprecated | 🟡 Середній | Next.js 16 → використовувати "proxy" |
| ~22k дублікатів (zona.media) | 🟡 Середній | Скрипт dedup_safe.py готовий |
| Telethon auth | 🟡 Середній | Rate limited, retry через 24г |
| VPS сервіси не перевірені | 🟡 Середній | 8005, 8006 — можливо впали |
| Тести відсутні | 🔴 Високий | 0 тестів, 0 CI checks |
| .env на Vercel | 🟢 Ок | Налаштовано через dashboard |

---

## 10. БЕЗПЕКА

| Аспект | Статус |
|--------|--------|
| Auth middleware | ✅ Всі сторінки/API захищені |
| Debug endpoint | ✅ Вимкнено (404) |
| .env.local | ✅ В .gitignore |
| Supabase RLS | ⚠️ Потребує перевірки |
| Rate limiting | ❌ Не налаштовано |
| CORS | ⚠️ Default Next.js |
| Input sanitization | ⚠️ Базовий |
| HTTPS | ✅ Vercel auto-SSL |

---

## 11. CI/CD

```
git push origin main → GitHub → Vercel auto-deploy (~1m build)
```

| Крок | Статус |
|------|--------|
| Git Integration | ✅ GitHub → Vercel |
| Auto deploy on push | ✅ main branch |
| TypeScript check | ✅ (relaxed) |
| Linting | ❌ Не налаштовано |
| Tests | ❌ Немає |
| Preview deploys | ✅ На PR branches |

---

## 12. ROADMAP — ЩО ДАЛІ

### Phase 1: Стабілізація (1-2 тижні)
- [ ] Перевірити ВСІ VPS сервіси (ssh → systemctl status)
- [ ] Telethon авторизація (MTProto для Telegram)
- [ ] Запустити dedup (~22k дублікатів)
- [ ] Перевірити кожну сторінку на проді (ручне тестування)
- [ ] Виправити strictNullChecks (рефактор person page)
- [ ] Rate limiting на API

### Phase 2: Якість (2-4 тижні)
- [ ] Розбити persons/[id]/page.tsx на компоненти
- [ ] Додати базові тести (Jest/Vitest)
- [ ] CI pipeline (lint + test + build)
- [ ] Supabase RLS policies
- [ ] Error tracking (Sentry)
- [ ] Логування API calls

### Phase 3: Монетизація
- [ ] Кастомний домен (odb.ua)
- [ ] Тарифні плани (free/pro/enterprise)
- [ ] Stripe інтеграція
- [ ] API ключі для зовнішніх клієнтів
- [ ] Landing page
- [ ] Документація API (Swagger/OpenAPI)

### Phase 4: Масштабування
- [ ] Elasticsearch для пошуку (замість pg_trgm)
- [ ] Redis кеш
- [ ] Background jobs (BullMQ)
- [ ] Мікросервіси (виділити OSINT worker)
- [ ] Multi-tenant architecture

---

## 13. КОМАНДИ ДЛЯ ШВИДКОГО СТАРТУ

```bash
# Локальна розробка
cd C:\Users\Valeriiy\Documents\odb-platform
npm run dev          # → localhost:3000

# Build перевірка (завжди перед push!)
npm run build

# Git workflow
git checkout -b fix/опис-задачі
# ... зміни ...
git add конкретні-файли.ts
git commit -m "fix: опис"
git push origin fix/опис-задачі
gh pr create --draft

# VPS
ssh vps
systemctl status odb-telegram   # перевірити сервіс
journalctl -u odb-telegram -f   # логи в реалтаймі

# Enricher
python3.12 C:\Temp\odb_enricher_local.py

# Dedup
python3.12 C:\Temp\dedup_safe.py           # dry run
python3.12 C:\Temp\dedup_safe.py --delete   # видалити
```

---

*Документ згенеровано автоматично. Оновлювати при кожній значній зміні.*
