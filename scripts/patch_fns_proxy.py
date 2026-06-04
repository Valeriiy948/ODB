#!/usr/bin/env python3
"""Add FNS Russia (EGRUL) proxy route to registries.py on VPS"""

FNS_CODE = '''

# ─── FNS Russia (EGRUL) proxy ──────────────────────────────────────────────────

async def handle_fns_search(request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    query = body.get("query", "").strip()
    if not query:
        return web.json_response({"error": "query required", "results": []})

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://egrul.nalog.ru/search.json",
                data={"query": query, "page": "1"},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Origin": "https://egrul.nalog.ru",
                    "Referer": "https://egrul.nalog.ru/",
                    "Accept": "application/json, text/javascript, */*",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                data = await r.json()
                rows = data.get("rows", [])
                results = [
                    {
                        "name":     row.get("n", row.get("name", "")),
                        "inn":      row.get("i", row.get("inn", "")),
                        "ogrn":     row.get("o", row.get("ogrn", "")),
                        "kpp":      row.get("k", ""),
                        "region":   row.get("r", ""),
                        "address":  row.get("a", ""),
                        "status":   "ЛІКВІДОВАНА" if row.get("e") else ("У ПРОЦЕСІ ЛІКВІДАЦІЇ" if row.get("p") else "ДІЮЧА"),
                        "type":     "ІП" if row.get("y") == "fl" else "Юридична особа",
                        "reg_date": row.get("d", ""),
                    }
                    for row in rows[:20]
                ]
                return web.json_response({
                    "success": True,
                    "total": len(rows),
                    "query": query,
                    "results": results,
                    "source": "fns_egrul_vps",
                })
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e),
            "results": [],
            "note": "egrul.nalog.ru недоступний або тимчасово обмежений",
            "fallback_url": "https://egrul.nalog.ru/",
        })

app.router.add_post("/registry/fns/search", handle_fns_search)

'''

TARGET = '/opt/odb/registries.py'
INSERT_BEFORE = 'if __name__ == "__main__":'

with open(TARGET, 'r') as f:
    content = f.read()

if 'handle_fns_search' in content:
    print('FNS proxy already patched, skipping')
else:
    content = content.replace(INSERT_BEFORE, FNS_CODE + INSERT_BEFORE)
    with open(TARGET, 'w') as f:
        f.write(content)
    print('FNS proxy patched OK')

import py_compile
py_compile.compile(TARGET, doraise=True)
print('Syntax OK')
