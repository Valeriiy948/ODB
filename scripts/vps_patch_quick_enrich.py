#!/usr/bin/env python3
"""
Запустити на VPS: python3 /opt/odb/vps_patch_quick_enrich.py
Додає ендпоінти /search/quick та /enrich до telegram_search.py
"""
TARGET = '/opt/odb/telegram_search.py'

with open(TARGET, 'r') as f:
    txt = f.read()

if 'handle_quick_search' in txt:
    print('Already patched, skipping')
    exit(0)

NEW_HANDLERS = '''
async def handle_quick_search(request):
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
        results = await search_one_bot('@PeopleFindBaseBot', full_query, wait_sec=22)
        return web.json_response({'query': q, 'dob': dob, 'results': results, 'total': len(results)})
    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_enrich(request):
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

'''

# Insert new handlers before handle_search
txt = txt.replace(
    'async def handle_search(request',
    NEW_HANDLERS + 'async def handle_search(request',
    1
)

# Register new routes
txt = txt.replace(
    "app.router.add_get('/search', handle_search)",
    "app.router.add_get('/search', handle_search)\n    app.router.add_get('/search/quick', handle_quick_search)\n    app.router.add_get('/enrich', handle_enrich)"
)

with open(TARGET, 'w') as f:
    f.write(txt)

print('Patched OK: /search/quick and /enrich added')
# Verify
import subprocess
result = subprocess.run(['grep', '-n', 'handle_quick_search\|handle_enrich', TARGET], capture_output=True, text=True)
print(result.stdout)
