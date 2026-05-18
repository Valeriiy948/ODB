#!/usr/bin/env python3
"""
Telegram OSINT пошук для ODB — розширена версія v2
Запуск на VPS: python3 /opt/odb/telegram_search.py --port 8001

Залежності:
  pip3 install telethon aiohttp beautifulsoup4
"""

import asyncio
import os
import json
import re
import tempfile
import argparse
from aiohttp import web
from telethon import TelegramClient, events
from telethon.tl.functions.contacts import SearchRequest

API_ID   = int(os.getenv('TG_API_ID', '0'))
API_HASH = os.getenv('TG_API_HASH', '')
SESSION  = os.getenv('TG_SESSION', '/opt/odb/odb_osint')

# ── LEAK BOTS (пошук по ПІБ + ДН) ────────────────────────────────────────────
LEAK_BOTS = [
    '@PeopleFindBaseBot',    # SearchPeople Base — Сірена/Паспорт РФ/Родичі/Військові/СФР (основний)
    '@tipadox_bot',          # Savadox OSINT — email, картка, дохід, адреса
    '@black_sprut_bot',      # BlackSprut — паспорт, авто, телефони, адреси
    '@black_box_osint_bot',  # BlackBox — телефони, соцмережі
    '@getcontact_osint_bot', # GetContact — хто зберіг номер у телефоні
    '@PhoneLeaks_bot',       # Витоки по номеру телефону
]

# ── PHONE BOTS (пошук по номеру) ─────────────────────────────────────────────
PHONE_BOTS = [
    '@tipadox_bot',
    '@black_sprut_bot',
    '@getcontact_osint_bot',
    '@PhoneLeaks_bot',
]

# ── INN/SNILS BOTS (пошук по ІПН та СНІЛС) ───────────────────────────────────
INN_BOTS = [
    '@black_sprut_bot',
    '@PeopleFindBaseBot',
    '@tipadox_bot',
]

# ── CAR / ГИБДД BOTS (пошук по номеру або VIN) ───────────────────────────────
CAR_BOTS = [
    '@avtokod_bot',          # Avtokod — марка, рік, власник по держ.номеру
    '@black_sprut_bot',      # ГИБДД дані також є тут
    '@PeopleFindBaseBot',    # Є база ГИБДД
]

# ── FACE SEARCH BOTS (пошук по фото) ─────────────────────────────────────────
FACE_BOTS = [
    '@SearchFaceBot',        # SearchFace — схожі обличчя у VK/OK
]

client: TelegramClient | None = None


def extract_fields(text: str) -> dict:
    """Витягує структуровані поля з тексту витоку"""
    fields = {}
    patterns = {
        'phone':           r'(?:Телефон|Phone)[:\s]+([78\d][\d\s\-\(\)]{9,14})',
        'passport':        r'(?:Номер паспорта|Паспорт)[:\s]+([А-ЯA-ZА-ЯҐЄІЇа-яa-z]{0,4}\s*[\d\s]{6,12})',
        'series':          r'(?:Серия паспорта)[:\s]+([\d]{4})',
        'snils':           r'(?:Номер снилс|СНИЛС|Снилс)[:\s]+([\d\s\-]{11,14})',
        'inn':             r'(?:ИНН|Inn|Номер налогоплательщика|ІПН|IPN)[:\s]+([\d]{8,12})',
        'patronymic':      r'(?:Отчество|По батькові|Отч\.?)[:\s]+([А-ЯҐЄІЇа-яґєії]{3,30})',
        'dob':             r'(?:Дата рождения|ДН|Дата народження)[:\s]+([\d]{1,2}[.\-/][\d]{1,2}[.\-/][\d]{2,4})',
        'address':         r'(?:Адрес|Адреса|Место регистрации)\s*:\s*([^\n]{5,100})',
        'rank':            r'(?:Воинское звание|Звание|Звання)[:\s]+([^\n]{3,40})',
        'unit':            r'(?:Войсковая часть|В/Ч)[:\s]+([^\n]{5,60})',
        'employer':        r'(?:Работодатель|Место работы|Організація)[:\s]+([^\n]{5,100})',
        'personal_num':    r'(?:Личный номер)[:\s]+([А-ЯA-Z\d\-]{5,15})',
        'tab_num':         r'(?:Табельный\s+номер)[:\s]+(\d+)',
        'relatives':       r'(?:Родственники|Родичі)[:\s]+([^\n]{10,2000})',
        'vk':              r'(https?://vk\.com/[^\s]+)',
        'ok':              r'(https?://ok\.ru/[^\s]+)',
        'email':           r'([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})',
        'card':            r'(\b[3-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b)',
        'income':          r'(?:Доход|Зарплата)[:\s]+([\d\s]{4,10})',
        'region':          r'(?:Регион|Субъект)[:\s]+([^\n]{3,50})',
        'car_info':        r'(?:Автомобиль|Транспортное средство|Марка)[:\s]+([^\n]{5,80})',
        'car_year':        r'(?:Год выпуска|Год изготовления|Рік)[:\s]+(\d{4})',
        'car_color':       r'(?:Цвет|Колір)[:\s]+([^\n]{3,20})',
        'vin':             r'(?:VIN|Вин|VIN-код)[:\s]+([A-HJ-NPR-Z0-9]{17})',
        'car_plate':       r'(?:Гос\.?\s*номер|Держ\.?\s*номер|Рег\.?\s*знак)[:\s]+([А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3})',
        'car_owner':       r'(?:Владелец|Власник)[:\s]+([А-ЯҐЄІЇа-яґєіїA-Z][А-ЯҐЄІЇа-яґєіїA-Za-z\s\-]{4,50})',
        'credit_card':     r'(?:Карта|Номер карты)[:\s]+([\d\s\*\-]{13,23})',
        'gender':          r'(?:Пол|Стать)[:\s]+([МЖMFмжmf]{1,6})',
        'debt_collector':  r'(?:Коллектор|Взыскатель|Кредитор|Отделение)[:\s]+([^\n]{5,100})',
        'debt_amount':     r'(?:Сумма Долга|Сумма долга|Сумма|Задолженность)[:\s]+([\d\s.,]+[\d])',
        'debt_type':       r'(?:Тип задолженности)[:\s]+([^\n]{5,80})',
        'court_case':      r'(?:Номер ИП|Номер дела|Дело)[:\s]+([A-Za-z0-9\/\-\.]{5,30})',
        'court_status':    r'(?:Статус)[:\s]+([^\n]{3,40})',
        'flight_from':     r'(?:Аэропорт Отправления)[:\s]+([А-ЯA-Z]{3})',
        'flight_to':       r'(?:Аэропорт Прибытия)[:\s]+([А-ЯA-Z]{3})',
        'nationality':     r'(?:Гражданство|Громадянство)[:\s]+([^\n]{3,30})',
        'passport_issuer': r'(?:Кем выдан|Орган|Виданий)[:\s]+([^\n]{5,100})',
        'name':            r'(?:ФИО|ПІБ|Фамилия Имя Отчество)[ \t]*:[ \t]*([А-ЯҐЄІЇа-яґєіїA-Z][А-ЯҐЄІЇа-яґєіїA-Za-z \-]{4,58}[А-ЯҐЄІЇа-яґєіїa-z])',
        'inn_confirmed':   r'(?:ИНН подтвержден|ИНН найден)[:\s]+([\d]{10,12})',
        'snils_confirmed': r'(?:СНИЛС подтвержден|СНИЛС найден)[:\s]+([\d\s\-]{11,14})',
    }

    # Видаляємо Markdown форматування
    clean = re.sub(r'[*_~`#]', '', text)
    # Видаляємо емодзі та non-ASCII/non-Cyrillic
    clean = re.sub(r'[^\x00-\x7FЀ-ӿ\s:.,\-/()0-9+@]', '', clean)

    for key, pattern in patterns.items():
        m = re.search(pattern, clean, re.IGNORECASE)
        if m:
            fields[key] = m.group(1).strip()

    # Валідація адреси
    if 'address' in fields:
        addr = fields['address']
        has_digits = bool(re.search(r'\d', addr))
        has_street = bool(re.search(r'(?:ул\.|пер\.|пр\.|пл\.|д\.|кв\.|обл\.|р-н|вул\.|буд\.|провул)', addr, re.IGNORECASE))
        if not has_digits and not has_street:
            del fields['address']

    # Збираємо всі телефони
    phones = re.findall(r'\+?[78]\d[\d\s\-\(\)]{8,10}', clean)
    phones = [re.sub(r'[\s\-\(\)]', '', p) for p in phones if len(re.sub(r'[\s\-\(\)]', '', p)) == 11]
    if phones:
        fields['phones_list'] = list(set(phones))

    # Збираємо всі автономери
    plates = re.findall(r'\b([А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3})\b', clean)
    if plates:
        fields['car_plates_list'] = list(set(plates))

    # Збираємо всі email
    emails = re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', clean)
    if emails:
        fields['emails_list'] = list(set(emails))

    return fields


def parse_html_file(html_content: str) -> list[dict]:
    """Парсить HTML файл від бота з витоками"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print('beautifulsoup4 не встановлено, pip3 install beautifulsoup4')
        return []

    soup = BeautifulSoup(html_content, 'html.parser')
    results = []

    headers = soup.find_all(['h2', 'h3'])

    for header in headers:
        section_name = header.get_text(strip=True)
        if not section_name or 'Table of Contents' in section_name or 'Зміст' in section_name:
            continue

        section_text_parts = []
        sibling = header.next_sibling
        while sibling:
            if hasattr(sibling, 'name') and sibling.name in ['h2', 'h3']:
                break
            if hasattr(sibling, 'get_text'):
                t = sibling.get_text(separator='\n', strip=True)
                if t:
                    section_text_parts.append(t)
            elif isinstance(sibling, str) and sibling.strip():
                section_text_parts.append(sibling.strip())
            sibling = sibling.next_sibling

        section_text = '\n'.join(section_text_parts)
        if len(section_text) < 10:
            continue

        fields = extract_fields(section_text)

        results.append({
            'source': 'telegram_leak',
            'source_label': f'📂 {section_name}',
            'snippet': section_text[:800],
            'fields': fields,
            'date': None,
            'url': None,
        })

    if not results:
        all_text = soup.get_text(separator='\n', strip=True)
        if len(all_text) > 50:
            fields = extract_fields(all_text)
            results.append({
                'source': 'telegram_leak',
                'source_label': '📂 Витік (HTML)',
                'snippet': all_text[:1000],
                'fields': fields,
                'date': None,
                'url': None,
            })

    return results


async def search_one_bot(chat: str, query: str, wait_sec: int = 12, skip_download: bool = False) -> list[dict]:
    """Шукає через один бот. Завантажує ВСІ HTML файли, фільтрує тільки нові повідомлення."""
    results = []
    try:
        entity = await client.get_entity(chat)

        history = await client.get_messages(entity, limit=1)
        last_id = history[0].id if history else 0

        await client.send_message(entity, query)
        print(f'  [{chat}] Запит відправлено (last_id={last_id}), чекаємо {wait_sec}с...')
        await asyncio.sleep(wait_sec)

        all_msgs = await client.get_messages(entity, limit=30, min_id=last_id)
        new_msgs = list(all_msgs)
        print(f'  [{chat}] Нових повідомлень: {len(new_msgs)}')

        for msg in new_msgs:
            if msg.text and len(msg.text) > 30:
                fields = extract_fields(msg.text)
                results.append({
                    'source': chat.replace('@', ''),
                    'source_label': chat,
                    'snippet': msg.text[:2000],
                    'fields': fields,
                    'date': msg.date.isoformat() if msg.date else None,
                    'url': f'https://t.me/{chat.replace("@", "")}/{msg.id}',
                })

        if not skip_download:
            clicked = False
            for msg in new_msgs:
                if msg.buttons and not clicked:
                    for row in msg.buttons:
                        for btn in row:
                            label = (btn.text or '').lower()
                            if any(w in label for w in ['скачать', 'download', 'скачати', 'завантажити']):
                                try:
                                    print(f'  [{chat}] Клік "{btn.text}", чекаємо 40с на всі файли...')
                                    await msg.click(text=btn.text)
                                    clicked = True
                                    await asyncio.sleep(40)
                                except Exception as e:
                                    print(f'  [{chat}] Помилка кліку: {e}')
                                break

            if clicked:
                all_msgs2 = await client.get_messages(entity, limit=50)
                new_msgs2 = [m for m in all_msgs2 if m.id > last_id]
                print(f'  [{chat}] Після кліку нових повідомлень: {len(new_msgs2)}')

                html_count = 0
                for msg in new_msgs2:
                    if not msg.document:
                        continue
                    attrs = msg.document.attributes or []
                    filename = next((a.file_name for a in attrs if hasattr(a, 'file_name') and a.file_name), '')
                    mime = msg.document.mime_type or ''

                    is_html = filename.endswith('.html') or mime == 'text/html'
                    is_text = filename.endswith('.txt') or mime == 'text/plain'

                    if not (is_html or is_text):
                        continue

                    try:
                        with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as tmp:
                            tmp_path = tmp.name
                        await client.download_media(msg, file=tmp_path)

                        with open(tmp_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        os.unlink(tmp_path)

                        if is_html:
                            parsed = parse_html_file(content)
                        else:
                            fields = extract_fields(content)
                            parsed = [{
                                'source': chat.replace('@', ''),
                                'source_label': f'{chat} (файл)',
                                'snippet': content[:2000],
                                'fields': fields,
                                'date': msg.date.isoformat() if msg.date else None,
                                'url': None,
                            }]

                        html_count += 1
                        results.extend(parsed)
                        print(f'  [{chat}] HTML #{html_count} ({filename}, {len(content)}б) → {len(parsed)} секцій')

                    except Exception as e:
                        print(f'  [{chat}] Помилка файлу {filename}: {e}')

                if html_count == 0:
                    print(f'  [{chat}] HTML файлів не знайдено після кліку')

    except Exception as e:
        print(f'Bot error ({chat}): {e}')

    return results


async def search_telegram(query: str, dob: str = '', limit: int = 20) -> list[dict]:
    results = []

    full_query = f"{query} {dob}".strip() if dob else query
    print(f'Telegram пошук: "{full_query}"')

    # 1. Пошук контактів через MTProto API
    try:
        search_result = await client(SearchRequest(q=query, limit=limit))
        for user in search_result.users[:10]:
            name = ' '.join(filter(None, [user.first_name, user.last_name]))
            photo_url = None
            try:
                if user.photo:
                    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                        tmp_path = tmp.name
                    await client.download_profile_photo(user, file=tmp_path)
                    photo_url = f'tg_photo_{user.id}.jpg'
            except Exception:
                pass

            results.append({
                'source': 'telegram_contacts',
                'source_label': 'Telegram контакт',
                'name': name,
                'username': f'@{user.username}' if user.username else None,
                'phone': getattr(user, 'phone', None),
                'tg_id': user.id,
                'photo_url': photo_url,
                'url': f'https://t.me/{user.username}' if user.username else None,
                'fields': {
                    'phone': getattr(user, 'phone', None),
                    'tg_id': str(user.id),
                },
            })
    except Exception as e:
        print(f'Помилка пошуку контактів: {e}')

    # 2. Phase 1: пошук по імені через всі боти
    tasks = []
    for chat in LEAK_BOTS:
        wait = 35 if 'PeopleFindBase' in chat or 'tipadox' in chat else 20
        tasks.append(search_one_bot(chat, full_query, wait_sec=wait))

    for res in await asyncio.gather(*tasks, return_exceptions=True):
        if isinstance(res, list):
            results.extend(res)

    # 3. Phase 2: автоматичний пошук по знайдених телефонах
    found_phones = set()
    for r in results:
        f = r.get('fields', {})
        for p in (f.get('phones_list') or []):
            found_phones.add(p)
        if f.get('phone'):
            found_phones.add(f['phone'])

    if found_phones:
        phones_to_search = list(found_phones)[:3]
        print(f'Phone search phase 2: {phones_to_search}')
        phone_tasks = []
        for phone in phones_to_search:
            for chat in PHONE_BOTS[:2]:
                phone_tasks.append(search_one_bot(chat, phone, wait_sec=20))
        for pr in await asyncio.gather(*phone_tasks, return_exceptions=True):
            if isinstance(pr, list):
                for r in pr:
                    r['from_phone'] = True
                    r['source_label'] = '📞 ' + r.get('source_label', r.get('source', ''))
                results.extend(pr)

    return results


# ── HTTP HANDLERS ─────────────────────────────────────────────────────────────

async def handle_search(request: web.Request) -> web.Response:
    q   = request.rel_url.query.get('q', '').strip()
    dob = request.rel_url.query.get('dob', '').strip()

    if len(q) < 3:
        return web.json_response({'error': 'Query too short'}, status=400)
    if not client or not client.is_connected():
        return web.json_response({'error': 'Telegram client not connected'}, status=503)

    try:
        results = await search_telegram(q, dob=dob)
        return web.json_response({'query': q, 'dob': dob, 'results': results, 'total': len(results)})
    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_health(request: web.Request) -> web.Response:
    connected = client and client.is_connected()
    return web.json_response({'status': 'ok' if connected else 'disconnected'})


async def handle_quick_search(request: web.Request) -> web.Response:
    """Швидкий пошук: тільки PeopleFindBaseBot, без Phase 2"""
    q   = request.rel_url.query.get('q', '').strip()
    dob = request.rel_url.query.get('dob', '').strip()
    if len(q) < 3:
        return web.json_response({'error': 'Query too short'}, status=400)
    if not client or not client.is_connected():
        return web.json_response({'error': 'Telegram client not connected'}, status=503)
    try:
        full_query = f"{q} {dob}".strip() if dob else q
        print(f'Quick search: "{full_query}"')
        results = await search_one_bot('@PeopleFindBaseBot', full_query, wait_sec=12, skip_download=False)
        return web.json_response({'query': q, 'dob': dob, 'results': results, 'total': len(results)})
    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_enrich(request: web.Request) -> web.Response:
    """Поглиблений пошук по телефону / email / ІНН через PHONE_BOTS"""
    q = request.rel_url.query.get('q', '').strip()
    if len(q) < 3:
        return web.json_response({'error': 'Query too short'}, status=400)
    if not client or not client.is_connected():
        return web.json_response({'error': 'Telegram client not connected'}, status=503)
    try:
        print(f'Enrich search: "{q}"')
        tasks = [search_one_bot(chat, q, wait_sec=20) for chat in PHONE_BOTS[:2]]
        all_results = []
        for res in await asyncio.gather(*tasks, return_exceptions=True):
            if isinstance(res, list):
                all_results.extend(res)
        return web.json_response({'query': q, 'results': all_results, 'total': len(all_results)})
    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_car_search(request: web.Request) -> web.Response:
    """
    ГИБДД пошук: по держ.номеру або VIN
    GET /search/car?plate=А123БВ77  або  ?vin=VIN17CHARS
    Повертає: [{owner, car_info, car_year, car_color, vin, ...}]
    """
    plate = request.rel_url.query.get('plate', '').strip()
    vin   = request.rel_url.query.get('vin', '').strip()
    query = plate or vin

    if len(query) < 4:
        return web.json_response({'error': 'plate або vin обов\'язковий'}, status=400)
    if not client or not client.is_connected():
        return web.json_response({'error': 'Telegram client not connected'}, status=503)

    try:
        print(f'Car search: "{query}"')
        tasks = [search_one_bot(chat, query, wait_sec=15, skip_download=True) for chat in CAR_BOTS]
        all_results = []
        for res in await asyncio.gather(*tasks, return_exceptions=True):
            if isinstance(res, list):
                # Залишаємо тільки результати з автоданими
                for r in res:
                    f = r.get('fields', {})
                    if any(k in f for k in ['car_info', 'car_owner', 'vin', 'car_plate', 'car_year']):
                        r['category'] = 'vehicle'
                        all_results.append(r)
        return web.json_response({
            'query': query,
            'type': 'plate' if plate else 'vin',
            'results': all_results,
            'total': len(all_results),
        })
    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_inn_search(request: web.Request) -> web.Response:
    """
    ІПН / СНІЛС пошук
    GET /search/inn?inn=580505888424  або  ?snils=13565895501
    """
    inn   = request.rel_url.query.get('inn', '').strip()
    snils = request.rel_url.query.get('snils', '').strip()
    query = inn or snils

    if len(query) < 8:
        return web.json_response({'error': 'inn або snils обов\'язковий (мін 8 цифр)'}, status=400)
    if not client or not client.is_connected():
        return web.json_response({'error': 'Telegram client not connected'}, status=503)

    try:
        print(f'INN/SNILS search: "{query}"')
        tasks = [search_one_bot(chat, query, wait_sec=20, skip_download=False) for chat in INN_BOTS]
        all_results = []
        for res in await asyncio.gather(*tasks, return_exceptions=True):
            if isinstance(res, list):
                all_results.extend(res)
        return web.json_response({
            'query': query,
            'type': 'inn' if inn else 'snils',
            'results': all_results,
            'total': len(all_results),
        })
    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_face_search(request: web.Request) -> web.Response:
    """
    Фото-пошук по обличчю через @SearchFaceBot
    POST /search/face  body: multipart/form-data, field: photo (binary)
    Повертає: [{url, source, similarity, profile_url}]
    """
    if not client or not client.is_connected():
        return web.json_response({'error': 'Telegram client not connected'}, status=503)

    try:
        reader = await request.multipart()
        field = await reader.next()
        if field is None or field.name != 'photo':
            return web.json_response({'error': 'Поле "photo" обов\'язкове'}, status=400)

        photo_data = await field.read()
        if len(photo_data) < 1000:
            return web.json_response({'error': 'Фото занадто маленьке'}, status=400)

        # Зберігаємо тимчасово
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp.write(photo_data)
            tmp_path = tmp.name

        try:
            entity = await client.get_entity('@SearchFaceBot')

            history = await client.get_messages(entity, limit=1)
            last_id = history[0].id if history else 0

            # Відправляємо фото боту
            await client.send_file(entity, tmp_path, caption='search')
            print(f'  [@SearchFaceBot] Фото відправлено, чекаємо 30с...')
            await asyncio.sleep(30)

            new_msgs = await client.get_messages(entity, limit=20, min_id=last_id)

            results = []
            for msg in new_msgs:
                if msg.text:
                    # Шукаємо VK/OK посилання у відповіді
                    vk_links = re.findall(r'https?://vk\.com/[^\s\)]+', msg.text)
                    ok_links = re.findall(r'https?://ok\.ru/[^\s\)]+', msg.text)
                    sim_match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%', msg.text)
                    similarity = float(sim_match.group(1)) if sim_match else None

                    for link in vk_links:
                        results.append({'source': 'vk', 'url': link, 'similarity': similarity, 'raw': msg.text[:500]})
                    for link in ok_links:
                        results.append({'source': 'ok', 'url': link, 'similarity': similarity, 'raw': msg.text[:500]})

                    if not vk_links and not ok_links and len(msg.text) > 20:
                        results.append({'source': 'SearchFaceBot', 'text': msg.text[:500], 'similarity': similarity})

            return web.json_response({'results': results, 'total': len(results)})

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def main():
    global client

    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()

    if not API_ID or not API_HASH:
        print('ERROR: Set TG_API_ID and TG_API_HASH environment variables')
        return

    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    print(f'Telegram client connected as: {await client.get_me()}')

    app = web.Application()
    app.router.add_get('/search',        handle_search)
    app.router.add_get('/search/quick',  handle_quick_search)
    app.router.add_get('/enrich',        handle_enrich)
    app.router.add_get('/health',        handle_health)
    # ── Нові ендпоінти v2 ───────────────────────────────────────────────────
    app.router.add_get('/search/car',    handle_car_search)    # ГИБДД по номеру/VIN
    app.router.add_get('/search/inn',    handle_inn_search)    # ІПН/СНІЛС пошук
    app.router.add_post('/search/face',  handle_face_search)   # Фото → VK/OK профіль

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', args.port)
    await site.start()
    print(f'Telegram search service v2 running on port {args.port}')
    print(f'Endpoints: /search /search/quick /enrich /search/car /search/inn /search/face /health')

    await asyncio.Event().wait()


if __name__ == '__main__':
    asyncio.run(main())
