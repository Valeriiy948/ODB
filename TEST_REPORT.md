# ODB Platform — Звіт тестування
**Дата:** 2026-05-25  
**Цикл:** 1

---

## ✅ ПРАЦЮЄ

### API Endpoints (localhost:3000)

| Endpoint | Метод | Статус | Примітка |
|---|---|---|---|
| `/api/persons` | GET | ✅ | Повертає дані з Supabase |
| `/api/persons/:id` | GET | ✅ | Деталі особи |
| `/api/incidents` | GET | ✅ | Порожньо (0 записів) |
| `/api/breach/search` | GET | ✅ | HIBP + LeakCheck Public активні |
| `/api/breach/search` | POST | ✅ | 1158 хітів для test@gmail.com |
| `/api/breach/catalog` | GET | ✅ | 172 360 записів у каталозі |
| `/api/shodan/search` | GET | ✅ | AbuseIPDB + GreyNoise активні |
| `/api/shodan/search` (IP) | POST | ✅ | Geo + GreyNoise + AbuseIPDB |
| `/api/shodan/search` (domain) | POST | ✅ | DNS + WHOIS |
| `/api/settings` | GET | ✅ | Показує статус ключів |
| `/api/search` | GET | ✅ | Локальний + Serper пошук |
| `/api/web/search` | POST | ✅ | Tavily + Serper |
| `/api/company/search` | POST | ✅ | Fallback (без YouControl/ODB ключів) |
| `/api/nazk/search` | POST | ✅ | НАЗК декларації |
| `/api/erb/search` | POST | ✅ | ЄРДБ боржники |
| `/api/myrotvorets/search` | POST | ✅ | Міротворець |
| `/api/social/search` | POST | ✅ | Через VPS 8005 |
| `/api/osint/sherlock` | POST | ✅ | 15 платформ |
| `/api/osint/telegram-phone/:id` | POST | ✅ | |
| `/api/osint/instagram/:id` | POST | ✅ | |
| `/api/osint/tiktok/:id` | POST | ✅ | |
| `/api/osint/vehicles/:id` | POST | ✅ | |
| `/api/osint/nazk/:id` | POST | ✅ | |
| `/api/osint/opendatabot/:id` | POST | ✅ | |
| `/api/osint/search/:id` | POST | ✅ | Vector search |
| `/api/admin/users` | GET | ✅ | Захищений (401 без токена) |

### VPS Сервіси (161.35.86.145)

| Сервіс | Порт | Статус | Примітка |
|---|---|---|---|
| Telegram Search | 8001 | ✅ | `/health` OK, `/leaks/search` OK |
| Social Search | 8005 | ✅ | `/social/username` — 8+ платформ |
| Registries | 8006 | ✅ | `/health` OK |

### Активні API ключі

| Ключ | Статус | Ліміт |
|---|---|---|
| HIBP | ✅ Активний | Core 1 |
| AbuseIPDB | ✅ Активний | 1000/день безкоштовно |
| Tavily | ✅ Активний | 1000/міс |
| Serper | ✅ Активний | — |
| Anthropic (Claude) | ✅ Активний | — |
| GreyNoise | ✅ Безкоштовно | Community API |

---

## ❌ НЕ ПРАЦЮЄ / ПРОБЛЕМИ

| Проблема | Деталі | Рекомендація |
|---|---|---|
| **SpiderFoot (порт 8007)** | Порт ЗАЧИНЕНИЙ — сервіс не запущений | Запустити SpiderFoot на VPS |
| **VPS 8001 `/search`** | Таймаут при реальних запитах | Telegram боти повільні, це норма (90-120с) |
| **MVS пошук** | `OpenData MVS тимчасово недоступний` | Зовнішня залежність, не в нашій владі |
| **VK пошук** | 503 — `VK_ACCESS_TOKEN` порожній | Додати токен VK |
| **`/api/osint/getcontact/:id`** | 400 — потребує номер телефону особи | Норма — особа без телефону |
| **`/api/osint/vk/:id`** | 503 — немає VK токена | Додати `VK_ACCESS_TOKEN` |

---

## 🐛 ВИПРАВЛЕНІ БАГИ (цей цикл)

### Bug #1: LeakCheck Public — поле `database` як об'єкт
**Файл:** `app/api/breach/search/route.ts`  
**Проблема:** API LeakCheck Public змінив формат — тепер `sources` повертає масив об'єктів `{name, date}` замість рядків. Поле `database` в UI показувало `[object Object]`.  
**Фікс:** Нормалізація маппінгу — перевірка типу, якщо об'єкт → `name + " (date)"`.  
**Перевірено:** `LeakCheck database value: LiveAuctioneers.com (2020-06)` ✅

---

## ⚠️ КЛЮЧІ — ВІДСУТНІ

| Ключ | Сервіс | Ціна | Вплив |
|---|---|---|---|
| `SHODAN_API_KEY` | Shodan | Безкоштовно | Мережева розвідка |
| `VK_ACCESS_TOKEN` | VK | Безкоштовно | Соцмережі |
| `DEHASHED_API_KEY` | DeHashed | $5.49/міс | Витоки |
| `LEAKCHECK_API_KEY` | LeakCheck Pro | $9/міс | Витоки |
| `SNUSBASE_API_KEY` | SnusBase | $6/міс | Витоки |
| `YOUCONTROL_API_KEY` | YouControl | ~$50/міс | Бізнес-розвідка |
| `OPENDATABOT_API_KEY` | OpenDataBot | Безкоштовно | ЄДР/ФОП |

**Пріоритет безкоштовних ключів: Shodan > VK Token > OpenDataBot**

---

## 📊 СТАТИСТИКА БАЗИ

- Persons: 167k+ записів
- Breach catalog: 172,360 записів
- Incidents: 0
- VPS Leaks DB: активна

---

## 🔧 РЕКОМЕНДАЦІЇ

1. **Shodan** — реєстрація безкоштовна: https://account.shodan.io → API Keys
2. **VK токен** — vk.com/apps → Standalone додаток → Service token
3. **OpenDataBot** — https://opendatabot.ua/api (є безкоштовний план)
4. **SpiderFoot** — перевірити чому не запущений на VPS порту 8007
5. **Розглянути OpenSanctions** — безкоштовний API санкційних списків ООН/OFAC/ЄС

---

*Звіт оновлюється автоматично після кожного циклу тестування.*
