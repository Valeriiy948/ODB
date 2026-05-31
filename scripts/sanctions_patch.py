#!/usr/bin/env python3
"""Patch registries.py — додає sanctions proxy routes"""

SANCTIONS_CODE = '''

# ─── Sanctions proxy → ODB Sanctions Service (localhost:8010) ─────────────────

async def handle_sanctions_search(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://127.0.0.1:8010/search",
                json=body,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                data = await r.json()
                return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e), "entries": [], "total": 0})

async def handle_sanctions_health(request):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "http://127.0.0.1:8010/health",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                data = await r.json()
                return web.json_response(data)
    except Exception as e:
        return web.json_response({"status": "error", "error": str(e)})

app.router.add_post("/registry/sanctions/search", handle_sanctions_search)
app.router.add_get("/registry/sanctions/health",  handle_sanctions_health)

'''

TARGET = '/opt/odb/registries.py'
INSERT_BEFORE = 'if __name__ == "__main__":'

with open(TARGET, 'r') as f:
    content = f.read()

if 'handle_sanctions_search' in content:
    print('Already patched, skipping')
else:
    content = content.replace(INSERT_BEFORE, SANCTIONS_CODE + INSERT_BEFORE)
    with open(TARGET, 'w') as f:
        f.write(content)
    print('Patched OK')

# Verify syntax
import py_compile
py_compile.compile(TARGET, doraise=True)
print('Syntax OK')
