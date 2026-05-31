#!/usr/bin/env python3
"""
ODB Registries Service — port 8006
Ukrainian government registries: MVS, ЄРДБ, Myrotvorets, NumBuster, IPN, advocates
"""
import asyncio
import aiohttp
import json
import re
import logging
from aiohttp import web
import os

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

PORT = int(os.environ.get('REGISTRIES_PORT', 8006))

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
BASE_HEADERS = {'User-Agent': UA, 'Accept': 'application/json,*/*', 'Accept-Language': 'uk,en;q=0.9'}

# ─── Health ───────────────────────────────────────────────────────────────────

async def handle_health(request):
    return web.json_response({"status": "ok", "service": "registries", "port": PORT})

# ─── Myrotvorets ──────────────────────────────────────────────────────────────

async def handle_myrotvorets(request):
    try:
        body = await request.json()
        query = body.get("query", "").strip()
        if len(query) < 3:
            return web.json_response({"error": "Мінімум 3 символи"}, status=400)

        async with aiohttp.ClientSession(headers=BASE_HEADERS) as session:
            url = f"https://myrotvorets.center/wp-json/wp/v2/posts?search={query}&per_page=15&_fields=id,title,link,excerpt,date"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=12)) as r:
                if r.status == 200:
                    posts = await r.json()
                    results = []
                    for p in posts:
                        excerpt = re.sub(r'<[^>]+>', '', p.get("excerpt", {}).get("rendered", "")).strip()
                        results.append({
                            "id": p.get("id"),
                            "title": re.sub(r'<[^>]+>', '', p.get("title", {}).get("rendered", "")),
                            "excerpt": excerpt[:300],
                            "url": p.get("link", ""),
                            "date": p.get("date", "")[:10],
                        })
                    return web.json_response({"success": True, "found": len(results), "results": results, "source": "Миротворець"})
                return web.json_response({"error": f"HTTP {r.status}", "results": []})
    except Exception as e:
        log.error(f"Myrotvorets: {e}")
        return web.json_response({"error": str(e), "results": []})

# ─── ЄРДБ (Єдиний реєстр боржників) ─────────────────────────────────────────

async def handle_erb(request):
    try:
        body = await request.json()
        last_name  = body.get("last_name",  body.get("query", "")).strip()
        first_name = body.get("first_name", "").strip()
        org_name   = body.get("org_name",   "").strip()

        if not last_name and not org_name:
            return web.json_response({"error": "Вкажіть прізвище або назву організації"}, status=400)

        debtor_type = "LEGAL" if org_name else "PHYSICAL"
        payload = {"debtorType": debtor_type, "lastName": last_name,
                   "firstName": first_name, "orgName": org_name}
        headers = {**BASE_HEADERS,
                   'Content-Type': 'application/json',
                   'Referer': 'https://erb.minjust.gov.ua/',
                   'Origin': 'https://erb.minjust.gov.ua'}

        async with aiohttp.ClientSession() as session:
            async with session.post("https://erb.minjust.gov.ua/api/v1/debtors/search",
                                    json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status == 200:
                    data = await r.json()
                    debtors = data if isinstance(data, list) else data.get("data", data.get("debtors", []))
                    return web.json_response({"success": True, "found": len(debtors),
                                             "debtors": debtors, "source": "ЄРДБ"})
                txt = await r.text()
                return web.json_response({"error": f"ЄРДБ HTTP {r.status}: {txt[:200]}", "debtors": []})
    except Exception as e:
        log.error(f"ERB: {e}")
        return web.json_response({"error": str(e), "debtors": []})

# ─── MVS OpenData ─────────────────────────────────────────────────────────────
# Resource IDs from data.gov.ua / opendata.mvs.gov.ua

MVS_RESOURCES = {
    "wanted":      "34c38865-bff2-4e5a-be71-3d4e79524dfc",
    "stolen_cars": "06779371-308f-42d5-895a-6e7f3e7cc90f",
    "lost_docs":   "2fcc8b42-91a2-4d86-b05c-e79e39f98c5e",
    "missing":     "a3f1e04b-7b25-4591-a7a0-f73f5f3c7dbc",
}

MVS_LABELS = {
    "wanted":      "МВС Розшук",
    "stolen_cars": "Авто в розшуку",
    "lost_docs":   "Втрачені документи",
    "missing":     "МВС Зниклі безвісти",
}

async def handle_mvs(request):
    try:
        resource = request.match_info.get("resource", "wanted")
        body = await request.json()
        query = body.get("query", "").strip()
        if len(query) < 2:
            return web.json_response({"error": "Введіть запит"}, status=400)

        resource_id = MVS_RESOURCES.get(resource)
        if not resource_id:
            return web.json_response({"error": f"Невідомий ресурс: {resource}"}, status=400)

        async with aiohttp.ClientSession(headers=BASE_HEADERS) as session:
            # Try data.gov.ua CKAN API
            url = "https://data.gov.ua/api/3/action/datastore_search"
            params = {"resource_id": resource_id, "q": query, "limit": 25}
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status == 200:
                    data = await r.json()
                    if data.get("success"):
                        records = data["result"]["records"]
                        total = data["result"]["total"]
                        return web.json_response({
                            "success": True, "records": records,
                            "total": total, "source": MVS_LABELS.get(resource, resource),
                        })
                # Fallback: try opendata.mvs.gov.ua
                url2 = "https://opendata.mvs.gov.ua/api/3/action/datastore_search"
                async with session.get(url2, params=params, timeout=aiohttp.ClientTimeout(total=15)) as r2:
                    if r2.status == 200:
                        data2 = await r2.json()
                        if data2.get("success"):
                            records = data2["result"]["records"]
                            total = data2["result"]["total"]
                            return web.json_response({
                                "success": True, "records": records,
                                "total": total, "source": MVS_LABELS.get(resource, resource),
                            })
                return web.json_response({
                    "success": False,
                    "error": "MVS OpenData тимчасово недоступний. Спробуйте пізніше.",
                    "records": [], "total": 0,
                    "fallback_url": f"https://wanted.mvs.gov.ua/?q={query}",
                })
    except Exception as e:
        log.error(f"MVS: {e}")
        return web.json_response({"error": str(e), "records": []})

# ─── NumBuster ───────────────────────────────────────────────────────────────

async def handle_numbuster(request):
    try:
        body = await request.json()
        phone = re.sub(r'[\s\-\(\)\+]', '', body.get("phone", "").strip())
        if not phone:
            return web.json_response({"error": "Вкажіть номер"}, status=400)
        if phone.startswith("0") and len(phone) == 10:
            phone = "38" + phone
        elif not phone.startswith("38"):
            phone = "38" + phone.lstrip("0")

        async with aiohttp.ClientSession() as session:
            headers = {**BASE_HEADERS,
                       'Referer': f'https://www.numbuster.com/',
                       'Accept': 'text/html,application/xhtml+xml,*/*'}
            url = f"https://www.numbuster.com/number/{phone}/"
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=12)) as r:
                text = await r.text()
                # Parse JSON-LD or page data
                json_match = re.search(r'"name"\s*:\s*"([^"]+)"', text)
                rating_match = re.search(r'"aggregateRating".*?"ratingValue"\s*:\s*"?(\d+)"?', text, re.DOTALL)
                comment_match = re.search(r'"description"\s*:\s*"([^"]+)"', text)
                spam_match = re.search(r'спам[^<>]*?(\d+)', text, re.IGNORECASE)

                if json_match:
                    return web.json_response({
                        "success": True, "phone": "+" + phone,
                        "name": json_match.group(1),
                        "rating": int(rating_match.group(1)) if rating_match else 0,
                        "comment": comment_match.group(1) if comment_match else "",
                        "spam_count": int(spam_match.group(1)) if spam_match else 0,
                        "url": url, "source": "NumBuster",
                    })
                return web.json_response({
                    "success": False, "phone": "+" + phone,
                    "message": "Номер не знайдено в NumBuster",
                    "url": url, "source": "NumBuster",
                })
    except Exception as e:
        log.error(f"NumBuster: {e}")
        return web.json_response({"error": str(e)})

# ─── Truecaller (unofficial) ──────────────────────────────────────────────────

async def handle_truecaller(request):
    try:
        body = await request.json()
        phone = re.sub(r'[\s\-\(\)\+]', '', body.get("phone", "").strip())
        if phone.startswith("0"):
            phone = "380" + phone[1:]
        elif not phone.startswith("380"):
            phone = "380" + phone

        async with aiohttp.ClientSession() as session:
            # Truecaller requires auth token — show fallback
            return web.json_response({
                "success": False,
                "message": "Truecaller потребує API токен. Перевірте вручну:",
                "phone": "+" + phone,
                "url": f"https://www.truecaller.com/search/ua/{phone}",
                "source": "Truecaller",
            })
    except Exception as e:
        return web.json_response({"error": str(e)})

# ─── IPN / ЄДРПОУ decoder ────────────────────────────────────────────────────

async def handle_ipn(request):
    try:
        body = await request.json()
        code = re.sub(r'\D', '', body.get("code", body.get("ipn", "")).strip())
        if len(code) not in [8, 10, 12, 13]:
            return web.json_response({"error": "Код має містити 8–13 цифр"}, status=400)

        results = []
        async with aiohttp.ClientSession(headers=BASE_HEADERS) as session:
            # OpenDataBot API (free tier)
            if len(code) == 8:
                url = f"https://api.opendatabot.ua/v2/company/{code}"
            else:
                url = f"https://api.opendatabot.ua/v2/fop/{code}"

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    data = await r.json()
                    if data.get("status") == "ok":
                        return web.json_response({"success": True, "data": data.get("data", data), "source": "OpenDataBot"})

            # Fallback: YouControl / Clarity
            url2 = f"https://clarity-project.info/edr/{code}"
            return web.json_response({
                "success": False,
                "code": code,
                "message": "Потрібен API ключ OpenDataBot або YouControl",
                "fallback_urls": [
                    f"https://clarity-project.info/edr/{code}",
                    f"https://youcontrol.com.ua/catalog/company_details/{code}/",
                    f"https://opendatabot.ua/c/{code}" if len(code) == 8 else f"https://opendatabot.ua/f/{code}",
                ],
                "source": "IPN/ЄДРПОУ Decoder",
            })
    except Exception as e:
        log.error(f"IPN: {e}")
        return web.json_response({"error": str(e)})

# ─── Advocates registry ───────────────────────────────────────────────────────

async def handle_advocates(request):
    try:
        body = await request.json()
        query = body.get("query", "").strip()
        if len(query) < 3:
            return web.json_response({"error": "Мінімум 3 символи"}, status=400)

        async with aiohttp.ClientSession(headers=BASE_HEADERS) as session:
            # VKDKA / BRDA public API
            url = f"https://www.vkdka.org.ua/search/?searchstring={query}&type=all"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=12)) as r:
                text = await r.text()
                results = []
                # Parse table rows
                rows = re.findall(r'<tr[^>]*class="(?:even|odd)[^"]*"[^>]*>(.*?)</tr>', text, re.DOTALL)
                for row in rows[:20]:
                    cols = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                    cols = [re.sub(r'<[^>]+>', '', c).strip() for c in cols]
                    if len(cols) >= 3:
                        results.append({
                            "name": cols[0],
                            "certificate": cols[1] if len(cols) > 1 else "",
                            "region": cols[2] if len(cols) > 2 else "",
                            "status": cols[3] if len(cols) > 3 else "",
                        })
                if results:
                    return web.json_response({"success": True, "found": len(results), "results": results, "source": "Реєстр адвокатів ВКДКА"})

            # Fallback: UNBA
            return web.json_response({
                "success": False,
                "found": 0, "results": [],
                "fallback_url": f"https://www.unba.org.ua/list-of-advocates/?search={query}",
                "source": "Реєстр адвокатів",
            })
    except Exception as e:
        log.error(f"Advocates: {e}")
        return web.json_response({"error": str(e), "results": []})

# ─── App ──────────────────────────────────────────────────────────────────────

app = web.Application()
app.router.add_get ("/health",                    handle_health)
app.router.add_post("/registry/myrotvorets",      handle_myrotvorets)
app.router.add_post("/registry/erb",              handle_erb)
app.router.add_post("/registry/mvs/{resource}",   handle_mvs)
app.router.add_post("/registry/numbuster",        handle_numbuster)
app.router.add_post("/registry/truecaller",       handle_truecaller)
app.router.add_post("/registry/ipn",              handle_ipn)
app.router.add_post("/registry/advocates",        handle_advocates)

if __name__ == "__main__":
    log.info(f"🏛️  ODB Registries service → port {PORT}")
    web.run_app(app, host="0.0.0.0", port=PORT)
