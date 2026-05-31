#!/usr/bin/env python3
"""
ODB Sanctions Service — port 8010
OpenSanctions bulk data: OFAC (США), EU, ООН РБ, UK HMT, РНБО, Interpол, Panama Papers
Завантажує ~300MB датасет одноразово → SQLite FTS5 індекс → search API

Endpoints:
  GET  /health          — статус сервісу
  GET  /stats           — статистика датасету
  POST /search          — пошук за ім'ям/псевдонімом
  POST /match           — матчинг з scoring (ім'я + ДН + країна)
  POST /reload          — перезавантажити датасет (admin)
"""

import asyncio
import json
import sqlite3
import logging
import os
import time
import threading
import urllib.request
from aiohttp import web
from pathlib import Path
from difflib import SequenceMatcher
import re

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [SANCTIONS] %(levelname)s: %(message)s'
)
log = logging.getLogger(__name__)

# ─── Конфігурація ─────────────────────────────────────────────────────────────

PORT     = int(os.environ.get('SANCTIONS_PORT', 8010))
DATA_DIR = Path(os.environ.get('SANCTIONS_DATA_DIR', '/data/sanctions'))
DB_PATH  = DATA_DIR / 'sanctions.db'

# Індекс датасетів OpenSanctions — звідси беремо актуальні URL
INDEX_URL = 'https://data.opensanctions.org/datasets/latest/index.json'

# Повний датасет (всі ~400k осіб, ~2.7GB)
FULL_DATASET = os.environ.get('FULL_DATASET', '1') == '1'

# Конкретні бази (якщо FULL_DATASET=0, ~220MB)
TARGET_DATASETS = [
    'ua_nsdc_sanctions',   # РНБО України
    'us_ofac_sdn',         # OFAC SDN США
    'eu_fsf',              # EU Financial Sanctions
    'interpol_red_notices',# Інтерпол Red Notice
    'eu_travel_bans',      # EU Travel Bans
    'un_sc_sanctions',     # ООН Рада Безпеки
    'ua_sfms_blacklist',   # ДФМУ України
    'us_ofac_cons',        # OFAC Consolidated
    'gb_hmt_invbans',      # UK HMT
]

# Пріоритетні санкційні бази (рос/біл агресори)
PRIORITY_COUNTRIES = {'ru', 'by', 'RU', 'BY'}

# Програми для display label
PROGRAM_LABELS = {
    'us_ofac_sdn':          'OFAC SDN (США)',
    'us_ofac_cons':         'OFAC Consolidated (США)',
    'eu_fsf':               'EU Financial Sanctions',
    'eu_travel_bans':       'EU Travel Bans',
    'gb_hmt_sanctions':     'UK HMT Sanctions',
    'un_sc_sanctions':      'ООН Рада Безпеки',
    'ua_nsdc_sanctions':    'РНБО України',
    'ua_sfms_blacklist':    'ДФМУ України',
    'interpol_red_notices': 'Інтерпол Red Notice',
    'ru_acf_bribetakers':   'Фонд Навального (корупція)',
    'icij_offshoreleaks':   'Panama Papers (ICIJ)',
    'icij_pandora':         'Pandora Papers (ICIJ)',
    'everypolitician':      'EveryPolitician',
    'ru_rupep':             'Російські ПЕП',
}

# ─── Стан сервісу ─────────────────────────────────────────────────────────────

state = {
    'status':      'initializing',  # initializing | downloading | indexing | ready | error
    'db_ready':    False,
    'total':       0,
    'persons':     0,
    'last_update': None,
    'error':       None,
}

# ─── SQLite helpers ───────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA cache_size=-32000')  # 32MB cache
    return conn

def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS entities (
            id          TEXT PRIMARY KEY,
            caption     TEXT,
            schema      TEXT,
            names       TEXT,
            aliases     TEXT,
            dob         TEXT,
            nationality TEXT,
            countries   TEXT,
            positions   TEXT,
            programs    TEXT,
            datasets    TEXT,
            passports   TEXT,
            addresses   TEXT,
            is_priority INTEGER DEFAULT 0,
            all_names   TEXT
        );

        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
            id             UNINDEXED,
            all_names,
            content        = 'entities',
            content_rowid  = 'rowid',
            tokenize       = 'unicode61 remove_diacritics 2'
        );
    """)
    conn.commit()
    return conn

# ─── Завантаження та індексування ─────────────────────────────────────────────

def get_dataset_urls() -> dict:
    """Отримує актуальні URL датасетів з OpenSanctions index"""
    try:
        with urllib.request.urlopen(INDEX_URL, timeout=30) as resp:
            index = json.loads(resp.read())
        urls = {}
        targets = ['default'] if FULL_DATASET else TARGET_DATASETS
        for ds in index.get('datasets', []):
            name = ds.get('name', '')
            if name in targets:
                for r in ds.get('resources', []):
                    if r.get('name') == 'entities.ftm.json':
                        urls[name] = (r['url'], r.get('size', 0))
                        break
        log.info(f'Found URLs: {list(urls.keys())}')
        return urls
    except Exception as e:
        log.error(f'Failed to get dataset index: {e}')
        return {}

def download_datasets() -> list:
    """Завантажує датасети (повний ~2.7GB або вибрані ~220MB)"""
    state['status'] = 'downloading'
    urls = get_dataset_urls()
    if not urls:
        raise RuntimeError('Could not get dataset URLs from OpenSanctions index')

    downloaded = []
    for ds_name, (url, size_bytes) in urls.items():
        out_path = DATA_DIR / f'{ds_name}.ftm.json'
        size_gb = size_bytes / 1024 / 1024 / 1024
        log.info(f'Downloading {ds_name} ({size_gb:.1f}GB)...')
        start = time.time()

        def progress(count, block, total, ds=ds_name):
            if total > 0 and count % 500 == 0:
                pct = count * block * 100 // total
                mb  = count * block // 1024 // 1024
                elapsed = time.time() - start
                speed_mbps = mb / elapsed if elapsed > 0 else 0
                eta_min = ((total - count * block) / 1024 / 1024 / speed_mbps / 60) if speed_mbps > 0 else 0
                log.info(f'  {ds}: {pct}% ({mb}MB) @ {speed_mbps:.0f}MB/s ETA:{eta_min:.0f}min')

        urllib.request.urlretrieve(url, str(out_path), reporthook=progress)
        elapsed = time.time() - start
        mb = out_path.stat().st_size / 1024 / 1024
        log.info(f'  {ds_name}: {mb:.0f}MB downloaded in {elapsed:.0f}s')
        downloaded.append(out_path)

    return downloaded

def _parse_entity_line(line: str, seen_ids: set, batch: list, total_ref: list, persons_ref: list):
    """Парсить один рядок NDJSON, додає до batch якщо новий"""
    line = line.strip()
    if not line:
        return
    try:
        entity = json.loads(line)
    except json.JSONDecodeError:
        return

    schema = entity.get('schema', '')
    if schema not in ('Person', 'LegalEntity', 'Organization', 'Company'):
        return

    eid = entity.get('id', '')
    if eid in seen_ids:
        return  # Дедуплікація між датасетами
    seen_ids.add(eid)

    props    = entity.get('properties', {})
    datasets = entity.get('datasets', [])

    names     = props.get('name', [])
    aliases   = props.get('alias', [])
    dobs      = props.get('birthDate', [])
    nats      = props.get('nationality', [])
    countries = props.get('country', [])
    positions = props.get('position', [])
    passports = props.get('passportNumber', []) + props.get('idNumber', [])
    addresses = props.get('address', [])

    all_countries = set(nats + countries)
    is_priority   = int(bool(all_countries & PRIORITY_COUNTRIES))
    all_names_flat = ' '.join(names + aliases)
    programs = [PROGRAM_LABELS.get(d, d) for d in datasets]

    batch.append((
        eid,
        entity.get('caption', names[0] if names else ''),
        schema,
        json.dumps(names[:10],    ensure_ascii=False),
        json.dumps(aliases[:10],  ensure_ascii=False),
        dobs[0] if dobs else None,
        json.dumps(list(all_countries), ensure_ascii=False),
        json.dumps(list(all_countries), ensure_ascii=False),
        json.dumps(positions[:5], ensure_ascii=False),
        json.dumps(programs[:10], ensure_ascii=False),
        json.dumps(datasets,      ensure_ascii=False),
        json.dumps(passports[:5], ensure_ascii=False),
        json.dumps(addresses[:3], ensure_ascii=False),
        is_priority,
        all_names_flat,
    ))

    total_ref[0] += 1
    if schema == 'Person':
        persons_ref[0] += 1

def index_dataset(conn: sqlite3.Connection, files: list):
    """Індексує список NDJSON файлів у SQLite FTS5"""
    state['status'] = 'indexing'
    log.info(f'Indexing {len(files)} dataset files...')
    start = time.time()

    conn.execute('DELETE FROM entities')
    conn.execute('DELETE FROM entities_fts')
    conn.commit()

    batch      = []
    seen_ids   = set()
    total_ref  = [0]
    persons_ref = [0]
    BATCH_SIZE = 1500

    def flush():
        if not batch:
            return
        conn.executemany("""
            INSERT OR REPLACE INTO entities
            (id, caption, schema, names, aliases, dob, nationality, countries,
             positions, programs, datasets, passports, addresses, is_priority, all_names)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, batch)
        conn.commit()
        batch.clear()

    for fpath in files:
        if not fpath.exists():
            log.warning(f'File not found: {fpath}')
            continue
        log.info(f'  Reading {fpath.name}...')
        with open(str(fpath), 'r', encoding='utf-8') as f:
            for line in f:
                _parse_entity_line(line, seen_ids, batch, total_ref, persons_ref)
                if len(batch) >= BATCH_SIZE:
                    flush()
        flush()
        log.info(f'  {fpath.stem}: done (total so far: {total_ref[0]})')

    # FTS rebuild одноразово в кінці
    log.info('Building FTS index...')
    conn.execute('INSERT INTO entities_fts(entities_fts) VALUES("rebuild")')
    conn.commit()

    elapsed = time.time() - start
    total, persons = total_ref[0], persons_ref[0]
    log.info(f'Indexed {total} entities ({persons} persons) in {elapsed:.0f}s')

    conn.execute("INSERT OR REPLACE INTO meta VALUES ('total', ?)",       (str(total),))
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('persons', ?)",     (str(persons),))
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('last_update', ?)", (str(int(time.time())),))
    conn.commit()

    state['total']       = total
    state['persons']     = persons
    state['last_update'] = int(time.time())

    # Видаляємо JSON файли після індексування — SQLite зберігає все
    freed = 0
    for fpath in files:
        if fpath.exists():
            freed += fpath.stat().st_size
            fpath.unlink()
    if freed:
        log.info(f'Freed {freed // 1024 // 1024}MB (deleted source JSON files)')

def _name_score(query: str, name: str) -> float:
    """Схожість двох рядків (0.0 — 1.0)"""
    q = query.lower().strip()
    n = name.lower().strip()
    if q == n:
        return 1.0
    if q in n or n in q:
        return 0.92
    return SequenceMatcher(None, q, n).ratio()

def search_entities(query: str, limit: int = 20, schema_filter: str = None) -> list:
    """FTS пошук + Python-рівень scoring"""
    if not state['db_ready']:
        return []

    conn = get_db()
    try:
        # Очищаємо запит для FTS (прибираємо спецсимволи)
        fts_query = re.sub(r'["\'\(\)\[\]\{\}\*\+\?\^]', ' ', query).strip()
        fts_query_words = fts_query.split()

        rows = []

        # FTS пошук
        if fts_query_words:
            fts_expr = ' OR '.join(f'"{w}"' for w in fts_query_words if len(w) >= 2)
            if fts_expr:
                try:
                    sql = """
                        SELECT e.* FROM entities e
                        JOIN entities_fts f ON e.rowid = f.rowid
                        WHERE entities_fts MATCH ?
                        ORDER BY e.is_priority DESC
                        LIMIT 200
                    """
                    if schema_filter:
                        sql = sql.replace('LIMIT 200', f'AND e.schema = "{schema_filter}" LIMIT 200')
                    rows = conn.execute(sql, (fts_expr,)).fetchall()
                except Exception as e:
                    log.warning(f'FTS error: {e}')

        # Fallback: LIKE пошук якщо FTS не дав результатів
        if not rows and len(query) >= 3:
            like_q = f'%{query}%'
            rows = conn.execute("""
                SELECT * FROM entities
                WHERE all_names LIKE ?
                ORDER BY is_priority DESC
                LIMIT 100
            """, (like_q,)).fetchall()

        if not rows:
            return []

        # Python-рівень scoring
        results = []
        for row in rows:
            names   = json.loads(row['names'] or '[]')
            aliases = json.loads(row['aliases'] or '[]')
            all_n   = names + aliases

            best_score = max((_name_score(query, n) for n in all_n), default=0.0)
            if best_score < 0.45:
                continue

            # Бонус для росіян/білорусів
            if row['is_priority']:
                best_score = min(1.0, best_score + 0.05)

            results.append({
                'id':          row['id'],
                'caption':     row['caption'],
                'schema':      row['schema'],
                'names':       names[:5],
                'aliases':     aliases[:5],
                'dob':         row['dob'],
                'nationality': json.loads(row['nationality'] or '[]'),
                'positions':   json.loads(row['positions'] or '[]'),
                'programs':    json.loads(row['programs'] or '[]'),
                'datasets':    json.loads(row['datasets'] or '[]'),
                'passports':   json.loads(row['passports'] or '[]'),
                'is_priority': bool(row['is_priority']),
                'score':       round(best_score, 3),
                'url':         f'https://www.opensanctions.org/entities/{row["id"]}/',
            })

        results.sort(key=lambda x: (-x['score'], -x['is_priority']))
        return results[:limit]

    finally:
        conn.close()

# ─── Background init ──────────────────────────────────────────────────────────

def background_init():
    """Запускається в окремому треді: завантаження + індексування"""
    try:
        conn = init_db()

        # Перевіряємо чи є вже проіндексовані дані
        existing = conn.execute("SELECT value FROM meta WHERE key='total'").fetchone()
        if existing and int(existing[0]) > 1000:
            state['total']    = int(conn.execute("SELECT value FROM meta WHERE key='total'").fetchone()[0])
            state['persons']  = int(conn.execute("SELECT value FROM meta WHERE key='persons'").fetchone()[0])
            ts = conn.execute("SELECT value FROM meta WHERE key='last_update'").fetchone()
            state['last_update'] = int(ts[0]) if ts else None
            state['db_ready'] = True
            state['status']   = 'ready'
            log.info(f'Loaded existing index: {state["total"]} entities ({state["persons"]} persons)')
            conn.close()

            # Перевіряємо чи треба оновити (раз на тиждень)
            if state['last_update'] and (time.time() - state['last_update']) > 7 * 24 * 3600:
                log.info('Dataset is >7 days old, scheduling background update...')
                threading.Timer(60, lambda: reload_dataset()).start()
            return

        # Перший запуск — завантажуємо датасети (JSON видаляються після індексування)
        downloaded = download_datasets()

        index_dataset(conn, downloaded)
        conn.close()

        state['db_ready'] = True
        state['status']   = 'ready'
        log.info('Sanctions service ready!')

    except Exception as e:
        state['status'] = 'error'
        state['error']  = str(e)
        log.error(f'Init error: {e}', exc_info=True)

def reload_dataset():
    """Перезавантаження датасету (для оновлення)"""
    state['status'] = 'reloading'
    state['db_ready'] = False
    try:
        log.info('Reloading dataset...')
        # Видаляємо старі файли
        for f in DATA_DIR.glob('*.ftm.json'):
            f.unlink()
        downloaded = download_datasets()
        conn = init_db()
        index_dataset(conn, downloaded)
        conn.close()
        state['db_ready'] = True
        state['status']   = 'ready'
        log.info('Dataset reloaded successfully')
    except Exception as e:
        state['status'] = 'error'
        state['error']  = str(e)
        log.error(f'Reload error: {e}', exc_info=True)

# ─── HTTP Handlers ────────────────────────────────────────────────────────────

async def handle_health(request):
    return web.json_response({
        'status':       state['status'],
        'db_ready':     state['db_ready'],
        'total':        state['total'],
        'persons':      state['persons'],
        'last_update':  state['last_update'],
        'service':      'sanctions',
        'port':         PORT,
        'source':       'OpenSanctions (OFAC, EU, UN, UK, РНБО, Interpol)',
    })

async def handle_stats(request):
    if not state['db_ready']:
        return web.json_response({'error': state['status']}, status=503)

    conn = get_db()
    try:
        # Топ датасети
        rows = conn.execute("""
            SELECT d.value as dataset, COUNT(*) as cnt
            FROM entities e,
                 json_each(e.datasets) d
            GROUP BY d.value
            ORDER BY cnt DESC
            LIMIT 20
        """).fetchall()
        datasets = [{'dataset': r['dataset'], 'count': r['cnt']} for r in rows]

        return web.json_response({
            'total':    state['total'],
            'persons':  state['persons'],
            'datasets': datasets,
            'updated':  state['last_update'],
        })
    finally:
        conn.close()

async def handle_search(request):
    """POST /search — пошук за ім'ям"""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    query = str(body.get('query', '') or body.get('q', '')).strip()
    if len(query) < 2:
        return web.json_response({'error': 'Мінімум 2 символи'}, status=400)

    if not state['db_ready']:
        return web.json_response({
            'error':   state['status'],
            'message': 'Індексування ще не завершено, спробуйте через кілька хвилин'
        }, status=503)

    limit = min(int(body.get('limit', 20)), 50)

    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, lambda: search_entities(query, limit))

    return web.json_response({
        'success':         True,
        'query':           query,
        'total':           len(results),
        'entries':         results,
        'sources_checked': ['ofac', 'eu_sanctions', 'un_security_council', 'ua_nsdc', 'uk_hmt', 'interpol', 'panama_papers'],
    })

async def handle_match(request):
    """POST /match — entity matching з scoring (ім'я + ДН + країна)"""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    name        = str(body.get('name', '')).strip()
    dob         = str(body.get('dob', '') or '').strip()
    nationality = str(body.get('nationality', '') or '').strip().lower()

    if not name or len(name) < 2:
        return web.json_response({'error': 'name required'}, status=400)

    if not state['db_ready']:
        return web.json_response({'error': state['status']}, status=503)

    loop = asyncio.get_event_loop()
    candidates = await loop.run_in_executor(None, lambda: search_entities(name, 30))

    # Додаємо бонус за збіг ДН та громадянства
    for c in candidates:
        bonus = 0.0
        if dob and c.get('dob') and dob[:4] == c['dob'][:4]:
            bonus += 0.15  # Рік народження збігається
        if dob and c.get('dob') and dob == c['dob']:
            bonus += 0.10  # Повна дата збігається
        if nationality and nationality in [n.lower() for n in c.get('nationality', [])]:
            bonus += 0.10  # Громадянство збігається
        c['score'] = min(1.0, c['score'] + bonus)

    candidates.sort(key=lambda x: -x['score'])
    high_confidence = [c for c in candidates if c['score'] >= 0.75]
    possible        = [c for c in candidates if 0.50 <= c['score'] < 0.75]

    return web.json_response({
        'success':         True,
        'name':            name,
        'match':           len(high_confidence) > 0,
        'high_confidence': high_confidence[:5],
        'possible':        possible[:5],
        'total_checked':   state['total'],
    })

async def handle_reload(request):
    """POST /reload — тригер оновлення датасету"""
    if state['status'] in ('downloading', 'indexing', 'reloading'):
        return web.json_response({'error': 'Already reloading'}, status=409)

    threading.Thread(target=reload_dataset, daemon=True).start()
    return web.json_response({'status': 'reloading', 'message': 'Reload started in background'})

# ─── App setup ────────────────────────────────────────────────────────────────

app = web.Application()
app.router.add_get( '/health',  handle_health)
app.router.add_get( '/stats',   handle_stats)
app.router.add_post('/search',  handle_search)
app.router.add_post('/match',   handle_match)
app.router.add_post('/reload',  handle_reload)

# Для сумісності з OpenSanctions API (наш app буде звертатись до /search/default)
async def handle_search_compat(request):
    q = request.rel_url.query.get('q', '')
    limit = int(request.rel_url.query.get('limit', 20))
    if not q:
        return web.json_response({'results': [], 'total': 0})
    if not state['db_ready']:
        return web.json_response({'results': [], 'total': 0, 'error': state['status']})
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, lambda: search_entities(q, limit))
    return web.json_response({'results': results, 'total': len(results), 'query': q})

app.router.add_get('/search/default', handle_search_compat)

if __name__ == '__main__':
    log.info(f'Starting ODB Sanctions Service on port {PORT}')
    log.info(f'Data dir: {DATA_DIR}')

    # Ініціалізуємо в background треді
    threading.Thread(target=background_init, daemon=True).start()

    web.run_app(app, host='0.0.0.0', port=PORT, access_log=None)
