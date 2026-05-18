#!/usr/bin/env python3
"""
VPN-захищений scraper для заблокованих OSINT ресурсів
ipbd.ru, leb.su, rusprofile.ru, getcontact.com

Вимоги:
  pip3 install aiohttp aiohttp-socks beautifulsoup4
  WireGuard або OpenVPN з RU-виходом

Запуск:
  python3 vpn_search.py --server --port 8003
  python3 vpn_search.py --name "Іванов Іван" --inn 123456789012
"""

import asyncio
import os
import json
import re
import argparse
from aiohttp import web, ClientSession, ClientTimeout
try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

VPN_INTERFACE = os.getenv('VPN_INTERFACE', 'wg0')    # WireGuard інтерфейс
VPN_CONFIG    = os.getenv('VPN_CONFIG', '/etc/wireguard/ru.conf')

# ── VPN управління ────────────────────────────────────────────────────────────
async def vpn_connect():
    """Підключити VPN"""
    try:
        proc = await asyncio.create_subprocess_exec(
            'wg-quick', 'up', VPN_INTERFACE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
        await asyncio.sleep(3)  # чекаємо підключення
        return proc.returncode == 0
    except Exception as e:
        print(f'VPN connect error: {e}')
        return False

async def vpn_disconnect():
    """Відключити VPN"""
    try:
        proc = await asyncio.create_subprocess_exec(
            'wg-quick', 'down', VPN_INTERFACE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
    except Exception:
        pass

async def vpn_is_connected():
    """Перевірити чи VPN активний"""
    try:
        proc = await asyncio.create_subprocess_exec(
            'wg', 'show', VPN_INTERFACE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        return proc.returncode == 0 and b'interface' in stdout
    except Exception:
        return False

# ── Scrapers ──────────────────────────────────────────────────────────────────
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ru-RU,ru;q=0.9',
}

async def scrape_ipbd(session, name='', dob='', inn='', passport='', **kwargs):
    """Пошук в базі ІПБД"""
    try:
        # ipbd.ru — база паспортних даних РФ
        params = {}
        if name:    params['fio'] = name
        if dob:     params['bdate'] = dob
        if inn:     params['inn'] = inn
        if passport: params['doc'] = passport

        async with session.get(
            'https://ipbd.ru/search',
            params=params,
            headers=HEADERS,
            timeout=ClientTimeout(total=20)
        ) as resp:
            if resp.status != 200:
                return []
            html = await resp.text()

        if not BS4_AVAILABLE:
            # Простий regex парсинг
            records = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', html)
            results = []
            for row in records[:10]:
                text = re.sub(r'<[^>]+>', ' ', row).strip()
                if text and len(text) > 20:
                    results.append({'snippet': text[:300], 'site': 'ipbd.ru'})
            return results

        soup = BeautifulSoup(html, 'html.parser')
        results = []
        for row in soup.select('tr.result-row, .person-card, .search-result')[:10]:
            data = {}
            for td in row.find_all('td'):
                label = td.get('data-label', '')
                if label: data[label] = td.get_text(strip=True)
            results.append({
                'site': 'ipbd.ru',
                'data': data,
                'snippet': row.get_text(' ', strip=True)[:300],
            })
        return results

    except Exception as e:
        return [{'site': 'ipbd.ru', 'error': str(e)}]


async def scrape_leb(session, name='', dob='', inn='', phone='', **kwargs):
    """ЛЕБ.СУ — витоки"""
    try:
        query = ' '.join(filter(None, [name, dob, inn]))
        if not query:
            return []

        async with session.get(
            f'https://leb.su/search?q={query}',
            headers=HEADERS,
            timeout=ClientTimeout(total=20)
        ) as resp:
            if resp.status != 200:
                return []
            html = await resp.text()

        results = []
        if BS4_AVAILABLE:
            soup = BeautifulSoup(html, 'html.parser')
            for item in soup.select('.result, .leak-item, article')[:10]:
                results.append({
                    'site': 'leb.su',
                    'snippet': item.get_text(' ', strip=True)[:300],
                })
        else:
            snippets = re.findall(r'<(?:div|article)[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)</(?:div|article)>', html)
            for s in snippets[:5]:
                results.append({'site': 'leb.su', 'snippet': re.sub(r'<[^>]+>', ' ', s).strip()[:300]})
        return results

    except Exception as e:
        return [{'site': 'leb.su', 'error': str(e)}]


async def scrape_rusprofile(session, name='', inn='', **kwargs):
    """Rusprofile.ru — бізнес-реєстр РФ"""
    try:
        if inn:
            url = f'https://www.rusprofile.ru/search?query={inn}&type=ul'
        elif name:
            url = f'https://www.rusprofile.ru/search?query={name}&type=ip'
        else:
            return []

        async with session.get(url, headers=HEADERS, timeout=ClientTimeout(total=20)) as resp:
            if resp.status != 200:
                return []
            html = await resp.text()

        results = []
        if BS4_AVAILABLE:
            soup = BeautifulSoup(html, 'html.parser')
            for item in soup.select('.company-item, .search-result-item')[:10]:
                results.append({
                    'site':    'rusprofile.ru',
                    'url':     item.find('a')['href'] if item.find('a') else None,
                    'snippet': item.get_text(' ', strip=True)[:300],
                })
        else:
            links = re.findall(r'href="(/id[^"]+)"', html)
            for l in links[:5]:
                results.append({'site': 'rusprofile.ru', 'url': f'https://www.rusprofile.ru{l}'})
        return results

    except Exception as e:
        return [{'site': 'rusprofile.ru', 'error': str(e)}]


SCRAPERS = {
    'ipbd.ru':       scrape_ipbd,
    'leb.su':        scrape_leb,
    'rusprofile.ru': scrape_rusprofile,
}

# ── HTTP сервер ───────────────────────────────────────────────────────────────
async def handle_vpn_search(request: web.Request) -> web.Response:
    try:
        body     = await request.json()
        name     = body.get('name', '')
        dob      = body.get('dob', '')
        inn      = body.get('inn', '')
        snils    = body.get('snils', '')
        passport = body.get('passport', '')
        phones   = body.get('phones', [])
        targets  = body.get('targets', list(SCRAPERS.keys()))

        # Підключаємо VPN
        vpn_connected = False
        if not await vpn_is_connected():
            vpn_connected = await vpn_connect()
        else:
            vpn_connected = True

        all_results = []
        async with ClientSession() as session:
            tasks = []
            for site in targets:
                if site in SCRAPERS:
                    tasks.append(SCRAPERS[site](
                        session,
                        name=name, dob=dob, inn=inn,
                        snils=snils, passport=passport,
                        phone=phones[0] if phones else ''
                    ))

            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, list):
                    all_results.extend(r)

        return web.json_response({
            'success':   True,
            'results':   all_results,
            'total':     len(all_results),
            'vpn_used':  vpn_connected,
            'sites':     targets,
        })

    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_health(request):
    vpn_on = await vpn_is_connected()
    return web.json_response({'status': 'ok', 'service': 'vpn-search', 'vpn': vpn_on})


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', action='store_true')
    parser.add_argument('--port', type=int, default=8003)
    parser.add_argument('--name')
    parser.add_argument('--inn')
    parser.add_argument('--dob')
    args = parser.parse_args()

    if args.server:
        app = web.Application()
        app.router.add_post('/vpn-search', handle_vpn_search)
        app.router.add_get('/health',      handle_health)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', args.port)
        await site.start()
        print(f'VPN search service running on port {args.port}')
        print(f'VPN interface: {VPN_INTERFACE}')
        await asyncio.Event().wait()
    else:
        # CLI режим
        vpn_ok = await vpn_connect()
        print(f'VPN: {"OK" if vpn_ok else "OFFLINE"}')
        async with ClientSession() as session:
            results = []
            if args.name:
                r = await scrape_ipbd(session, name=args.name, inn=args.inn or '', dob=args.dob or '')
                results.extend(r)
                r2 = await scrape_rusprofile(session, name=args.name, inn=args.inn or '')
                results.extend(r2)
            print(json.dumps(results, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    asyncio.run(main())
