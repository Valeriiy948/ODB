# ODB Platform — Повний розбір
> Станом на **15 червня 2026** · Розвідувальна система відкритих джерел (OSINT)

---

## 1. ЩО ЦЕ ТАКЕ

**ODB Platform** (Оперативна База Даних) — спеціалізована OSINT/HUMINT платформа для:
- 📋 документування воєнних злочинів РФ
- 🪖 ідентифікації російських військових
- ₿ крипто-форензики (відстеження гаманців)

Платформа агрегує дані з **20+ джерел** у єдиний профіль особи з автоматичним збагаченням та AI-аналізом.

| Параметр | Значення |
|---|---|
| Прод-URL | https://odb-one.vercel.app |
| Домен VPS | https://evidencebases.com |
| Записів у БД | **539 747 осіб** |
| API-маршрутів | **93** |
| Сторінок | **26** |
| Мова інтерфейсу | Українська (є EN/RU перемикач) |
| Статус | Робочий, у проді + активний редизайн інтерфейсу |

---

## 2. ТЕХНОЛОГІЇ

| Шар | Технологія |
|---|---|
| Фронтенд | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Стилі | Tailwind CSS v4 + власна дизайн-система (`globals.css`) |
| Хостинг фронту | Vercel Hobby (⚠️ ліміт 60с на функцію) |
| База даних | Supabase (PostgreSQL 15), EU-регіон |
| VPS-сервіси | Python (Telethon, реєстри, соцмережі) — DigitalOcean |
| Процес-менеджер VPS | systemd |
| Процес-менеджер локально | PM2 (`start-odb.vbs` → `pm2 resurrect`) |

---

## 3. ІНФРАСТРУКТУРА

### Vercel (фронтенд + API)
- Прод: `odb-one.vercel.app`
- ⚠️ Hobby-план: 60с ліміт на функцію → довгі операції винесені на VPS через SSE-стрімінг

### VPS (DigitalOcean AMS3)
- IP: `161.35.86.145`, домен `evidencebases.com` (Let's Encrypt SSL)
- SSH: `ssh -i ~/.ssh/id_odb root@161.35.86.145` (alias `vps`)
- ОС: Ubuntu 22.04.5 LTS
- RAM: 957 МБ (⚠️ рекомендовано апгрейд до 2 ГБ)
- nginx reverse-proxy, UFW (відкриті лише 80/443)

**Потік запитів:**
```
Браузер → Vercel (Next.js) → HTTPS → evidencebases.com/odb-api/ → nginx → localhost:PORT
```

**VPS-сервіси (порти закриті, лише через nginx):**
| Порт | Сервіс | Призначення |
|---|---|---|
| :8001 | odb-telegram | Telegram-боти, MTProto, LEAK_BOTS |
| :8005 | odb-social | Instagram / username пошук |
| :8006 | odb-registries | Миротворець, МВС, NumBuster, Truecaller, ІПН, ЄРБ |
| :8008 | odb-telethon | MTProto: телефон/ім'я пошук |
| :8011 | odb-orchestrator | Асинхронна черга, агрегація джерел |

**VPS Cron:**
- кожні 5 хв — health-монітор + авто-рестарт + Telegram-алерт
- кожні 30 хв — вбивство zombie Chrome > 2 год

### Supabase (база даних)
- URL: `zvvtldyxmjuzpyozneoo.supabase.co`
- RLS увімкнений (потрібна авторизація)
- Індекси: pg_trgm на іменах, GIN на телефонах[], btree на даті

---

## 4. БАЗА ДАНИХ

**539 747 осіб.** Ключові таблиці:

| Таблиця | Зміст |
|---|---|
| `persons` | Особи: ПІБ (UA/RU/EN), ДН, документи (ІПН, СНІЛС, паспорт), військові дані (звання, частина), телефони[], адреси, threat_score, ai_profile |
| `incidents` | Воєнні злочини: тип, дата, місце, severity, стаття МКС |
| `incident_persons` | Зв'язок особа ↔ злочин (роль) |
| `evidence` | Докази (фото/відео/документи) |
| `connections` | Зв'язки між особами |

**Імпортовані датасети:** ЗС РФ (~400k), Wagner (~5k), 656 ПОН, ЦВО телефони, 64 ОМБр, zona.media (~22k, є дублі).

---

## 5. ФУНКЦІОНАЛ — ЩО ПРАЦЮЄ

### 🔍 Пошук
- **Єдиний пошук** (`/search-all`) — SSE-стрім, 19 джерел паралельно
- Розумний парсинг запиту: «Іванов Іван 10.10.1993» → ПІБ + дата окремо
- Транслітерація UA/RU/EN (один запит = до 8 варіантів імені)
- Скоринг релевантності (фільтр сміття, бейджі «висока/можлива/низька»)
- Фільтр санкцій по прізвищу (більше не показує однофамільців)

### 👥 Картотека осіб
- 539k записів, пагінація, пошук по ПІБ/телефону/ІПН
- Сторінка особи: 10 вкладок (Огляд, Зв'язки, Злочини, Реєстри, Медіа, Документи, В/Ч, Крипто, OSINT, Нотатки)
- **AI-профіль** (Claude Sonnet 4.6) — автоматичний аналіз особи, threat_score
- PDF-звіт

### 📞 Phone Intelligence
- Оператор, наявність у Telegram, посилання на месенджери

### 🔓 Breach Intelligence
- LeakOsint (800+ баз), OsintKit (731 база), DeHashed, HIBP, LeakCheck

### 📋 Реєстри
- НАЗК декларації, Миротворець, МВС розшук, ЄРБ боржники, Санкції (РНБО/OFAC/EU)

### ₿ Крипто-розвідка
- TRC-20 USDT сканер, гаманці, watchlist, Whale Alert
- Telegram-бот з командами (`/status`, `/watchlist`, `/add`...)

### 🌐 Інше
- Мережева розвідка (IP/домен/Shodan), Бізнес-розвідка (ЄДР)

---

## 6. ХРОНОЛОГІЯ РОЗРОБКИ (PR)

| PR | Опис | Статус |
|---|---|---|
| #7–22 | Базова функціональність: orchestrator, crypto-модуль, Telegram-бот | ✅ |
| #23 | Person page → компоненти + VPS HTTPS (nginx, UFW) | ✅ |
| #24 | Phone enrichment pipeline | ✅ |
| #25 | Sherlock Bot на OSINT-вкладці | ✅ |
| #26 | Unified Search `/breach-intel` | ✅ |
| #27 | 🔒 Безпека: видалено debug-endpoints що зливали ключі | ✅ |
| #28 | Rate limiting (20/10 req/хв) | ✅ |
| **#29** | AI Profile fix: модель `claude-sonnet-4-6`, prompt caching, повна картка | ✅ merged 15.06 |
| **#30** | Search-all: парсинг дати, фільтр санкцій, Telegram-боти UI | ✅ merged 15.06 |
| **#31** | Search Intelligence: query-parser, транслітерація, скоринг + 50 тестів | ✅ merged 15.06 |

**Нові модулі (PR #31):**
- `lib/search/query-parser.ts` — парсинг ПІБ + дати + телефону
- `lib/search/name-normalizer.ts` — транслітерація UA/RU/EN
- `lib/search/relevance-scorer.ts` — скоринг 0..100, Левенштейн
- `lib/utils.ts` — `levenshteinNorm()`

---

## 7. РЕДИЗАЙН ІНТЕРФЕЙСУ (у процесі, гілка `feat/ui-redesign-foundation`)

**Мета:** «iOS світу OSINT» — інтуїтивно, сучасно, з анімаціями.

### Рішення (узгоджені)
- SVG лінійні іконки (не емодзі) — стиль SF Symbols
- Темна тема, освіжена (глибша)
- Мертві сторінки — видалити
- Старт: фундамент → Dashboard → решта екранів

### ✅ Зроблено
1. **Видалено 4 дублі-сторінки:** `fragment-search`, `social-search`, `sherlock`, `spiderfoot` (функціонал у `/search-all`)
2. **Дизайн-система** (`app/globals.css`):
   - CSS-токени: поверхні (`--odb-bg` … `--odb-surface-3`), текст, акцент, статуси
   - Утиліти: `.odb-glass` (скло), `.odb-card` + hover-підняття, `.odb-btn-accent`
   - 7 keyframe-анімацій (fade, slide, scale, shimmer, glow)
   - `.odb-stagger` (поява по черзі), `.odb-skeleton` (завантаження)
   - повага до `prefers-reduced-motion`
3. **Система іконок** (`app/components/Icon.tsx`): 26 inline SVG-іконок, без npm-залежностей
4. **Dashboard** переписано як еталон: скляний хедер, glow-логотип, пошук зі світінням, анімації, картки з підняттям

### ⏳ Далі (черга редизайну)
- Sidebar → Login → Search-all/Breach-intel → Persons → Incidents/Registries/Crypto

---

## 8. ВІДОМІ ПРОБЛЕМИ / ПОТРЕБУЄ УВАГИ

| Пріоритет | Що | Дія |
|---|---|---|
| 🔴 HIGH | LeakOsint ключ спливає ~05.07.2026 | Поновити на leakosint.com |
| 🟡 MED | `VPS_URL` відсутній у локальному `.env.local` | Додати `VPS_URL=https://evidencebases.com/odb-api` (для dev-пошуку) |
| 🟡 MED | VPS RAM 957 МБ | Апгрейд до 2 ГБ (DigitalOcean) |
| 🟡 MED | `TELEGRAM_BOT_TOKEN` у VPS cron | Додати в `/etc/environment` |
| 🟢 LOW | VK API token не налаштований | vk.com/dev |
| 🟢 LOW | ~22k дублів zona.media | `dedup_safe.py` готовий |

### API-ключі
- ✅ Активні: Supabase, Anthropic (claude-sonnet-4-6), OsintKit, LeakOsint, Serper, Tavily, DeHashed, HIBP, OpenSanctions
- ❌ Не налаштовані: VK, Google CSE

---

## 9. ROADMAP

### Фаза 1 — Стабілізація ✅ (≈95%)
VPS HTTPS, UFW, security, rate limiting, модуляризація, пошук виправлено. Лишилось: dedup zona.media.

### Фаза 2 — Розширення (поточна)
Unified Search ✅, Sherlock ✅, AI Profile ✅, **редизайн UI (у процесі)**, VK token, імпорт чиновників РФ.

### Фаза 3 — AI-асистент
AI-зв'язки між особами, AI-аналіз транзакцій, авто-AI-профіль.

### Фаза 4 — Масштабування / Монетизація
Vercel Pro + Supabase Pro, мульти-користувач (ролі), Stripe білінг.

### Фаза 5 — Продукт (конкурент Pandora)
Mobile PWA, Chrome Extension, публічний API, звіти для СБУ/НПУ.

---

## 10. МОНЕТИЗАЦІЯ

| Продукт | Час до ринку | Модель |
|---|---|---|
| **Whale Alert підписка** | 1-2 тижні | $50-200/міс ← найшвидший старт |
| Разові DOCX-звіти | зараз | per-report |
| API для юрфірм | 2-4 тижні | pay-per-query |
| B2B ліцензія НГО/журналістам | 1 місяць | грант |

---

## 11. ШВИДКИЙ СТАРТ (для розробника)

```bash
# Локальний запуск
cd C:\Users\Valeriiy\Documents\odb-platform
npm run dev                    # http://localhost:3000

# Або через PM2 (постійний фоновий режим)
start-odb.vbs                  # pm2 resurrect

# ⚠️ Після зміни globals.css / Tailwind-конфігу:
#    зупини PM2 (pm2 delete all), очисти кеш (rm -rf .next), запусти заново
```

**Git workflow:** гілка на задачу → PR → merge у `main` → авто-деплой Vercel.

---

*Документ оновлено: 15.06.2026. Тримати актуальним при значних змінах.*
