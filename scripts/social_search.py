#!/usr/bin/env python3
# /opt/odb/social_search.py
# Social Networks OSINT Service — порт 8005
# Підтримує: Instagram, TikTok, GetContact, Facebook basic, Username search

import asyncio
import json
import re
import os
from aiohttp import web, ClientSession, ClientTimeout
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s [social] %(message)s')
log = logging.getLogger(__name__)

PORT = int(os.environ.get('SOCIAL_PORT', 8005))
TIMEOUT = ClientTimeout(total=20)

# ─── HEADERS ────────────────────────────────────────────────────────────────────
CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'uk,ru;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

# ─── INSTAGRAM ──────────────────────────────────────────────────────────────────
async def search_instagram_username(session: ClientSession, username: str) -> dict:
    """Отримуємо публічний Instagram профіль по username"""
    try:
        url = f"https://www.instagram.com/{username}/?__a=1&__d=dis"
        async with session.get(url, headers={**CHROME_HEADERS, 'X-IG-App-ID': '936619743392459'}, ssl=False, timeout=TIMEOUT) as r:
            if r.status == 404:
                return {'found': False, 'reason': 'not_found'}
            if r.status == 401:
                return {'found': False, 'reason': 'private_or_login_required'}
            if r.status != 200:
                return {'found': False, 'reason': f'http_{r.status}'}
            data = await r.json(content_type=None)
            user = data.get('graphql', {}).get('user') or data.get('data', {}).get('user')
            if not user:
                # Try alternative endpoint
                return await search_instagram_alt(session, username)
            return {
                'found': True,
                'username': user.get('username'),
                'full_name': user.get('full_name'),
                'bio': user.get('biography', ''),
                'followers': user.get('edge_followed_by', {}).get('count', 0),
                'following': user.get('edge_follow', {}).get('count', 0),
                'posts': user.get('edge_owner_to_timeline_media', {}).get('count', 0),
                'is_private': user.get('is_private', False),
                'is_verified': user.get('is_verified', False),
                'profile_pic': user.get('profile_pic_url_hd') or user.get('profile_pic_url', ''),
                'external_url': user.get('external_url', ''),
                'url': f"https://www.instagram.com/{username}/",
                'platform': 'instagram',
            }
    except Exception as e:
        log.error(f"Instagram error for {username}: {e}")
        return {'found': False, 'reason': str(e)}

async def search_instagram_alt(session: ClientSession, username: str) -> dict:
    """Альтернативний метод через i.instagram.com"""
    try:
        url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={username}"
        headers = {**CHROME_HEADERS, 'X-IG-App-ID': '936619743392459'}
        async with session.get(url, headers=headers, ssl=False, timeout=TIMEOUT) as r:
            if r.status != 200:
                return {'found': False, 'reason': f'alt_http_{r.status}'}
            data = await r.json(content_type=None)
            user = data.get('data', {}).get('user', {})
            if not user:
                return {'found': False, 'reason': 'no_data'}
            return {
                'found': True,
                'username': user.get('username'),
                'full_name': user.get('full_name'),
                'bio': user.get('biography', ''),
                'followers': user.get('edge_followed_by', {}).get('count', 0),
                'following': user.get('edge_follow', {}).get('count', 0),
                'posts': user.get('edge_owner_to_timeline_media', {}).get('count', 0),
                'is_private': user.get('is_private', False),
                'is_verified': user.get('is_verified', False),
                'profile_pic': user.get('profile_pic_url', ''),
                'external_url': user.get('external_url', ''),
                'url': f"https://www.instagram.com/{username}/",
                'platform': 'instagram',
            }
    except Exception as e:
        return {'found': False, 'reason': str(e)}

# ─── TIKTOK ─────────────────────────────────────────────────────────────────────
async def search_tiktok_username(session: ClientSession, username: str) -> dict:
    """Публічний TikTok профіль по username"""
    try:
        clean = username.lstrip('@')
        url = f"https://www.tiktok.com/@{clean}"
        async with session.get(url, headers=CHROME_HEADERS, ssl=False, timeout=TIMEOUT) as r:
            if r.status == 404:
                return {'found': False, 'reason': 'not_found'}
            if r.status != 200:
                return {'found': False, 'reason': f'http_{r.status}'}
            html = await r.text()

            # Parse SIGI_STATE JSON
            m = re.search(r'<script id="SIGI_STATE"[^>]*>(.*?)</script>', html, re.DOTALL)
            if not m:
                m = re.search(r'window\.__INIT_PROPS__\s*=\s*(\{.*?\})\s*;', html, re.DOTALL)
            if not m:
                # Try to extract basic info from meta tags
                followers_m = re.search(r'"followerCount":(\d+)', html)
                name_m = re.search(r'"nickName":"([^"]+)"', html)
                bio_m = re.search(r'"signature":"([^"]*)"', html)
                return {
                    'found': True,
                    'username': clean,
                    'full_name': name_m.group(1) if name_m else '',
                    'bio': bio_m.group(1) if bio_m else '',
                    'followers': int(followers_m.group(1)) if followers_m else 0,
                    'url': f"https://www.tiktok.com/@{clean}",
                    'platform': 'tiktok',
                }

            try:
                data = json.loads(m.group(1))
                user_info = data.get('UserPage', {}).get('uniqueId', {})
                user = data.get('UserModule', {}).get('users', {}).get(clean, {})
                stats = data.get('UserModule', {}).get('stats', {}).get(clean, {})
                return {
                    'found': True,
                    'username': user.get('uniqueId', clean),
                    'full_name': user.get('nickname', ''),
                    'bio': user.get('signature', ''),
                    'followers': stats.get('followerCount', 0),
                    'following': stats.get('followingCount', 0),
                    'likes': stats.get('heartCount', 0),
                    'videos': stats.get('videoCount', 0),
                    'is_verified': user.get('verified', False),
                    'profile_pic': user.get('avatarThumb', ''),
                    'url': f"https://www.tiktok.com/@{clean}",
                    'platform': 'tiktok',
                }
            except json.JSONDecodeError:
                return {'found': False, 'reason': 'parse_error'}
    except Exception as e:
        log.error(f"TikTok error for {username}: {e}")
        return {'found': False, 'reason': str(e)}

# ─── GETCONTACT ──────────────────────────────────────────────────────────────────
async def search_getcontact(session: ClientSession, phone: str) -> dict:
    """GetContact — як люди зберегли цей номер у контактах"""
    try:
        clean = re.sub(r'\D', '', phone)
        if not clean.startswith('+'):
            clean = f'+{clean}'

        # GetContact не має публічного API, але є сторонні резолвери
        # Спробуємо через неофіційний endpoint
        url = "https://api.getcontact.com/v1/search"
        headers = {
            **CHROME_HEADERS,
            'Content-Type': 'application/json',
            'X-Token': os.environ.get('GETCONTACT_TOKEN', ''),
        }
        body = {'phoneNumber': clean, 'countryCode': 'UA'}

        if not os.environ.get('GETCONTACT_TOKEN'):
            # Fallback: спробуємо через NumBuster
            return await search_numbuster(session, phone)

        async with session.post(url, json=body, headers=headers, ssl=False, timeout=TIMEOUT) as r:
            if r.status != 200:
                return {'found': False, 'reason': f'http_{r.status}'}
            data = await r.json(content_type=None)
            tags = data.get('result', {}).get('tags', [])
            names = [t.get('tag') for t in tags if t.get('type') == 'name']
            return {
                'found': bool(names),
                'names': names[:10],
                'spam_score': data.get('result', {}).get('profileImage', {}).get('count', 0),
                'platform': 'getcontact',
                'phone': clean,
            }
    except Exception as e:
        return {'found': False, 'reason': str(e)}

async def search_numbuster(session: ClientSession, phone: str) -> dict:
    """NumBuster як fallback для GetContact"""
    try:
        clean = re.sub(r'\D', '', phone)
        url = f"https://numbuster.com/api/phone/{clean}"
        async with session.get(url, headers=CHROME_HEADERS, ssl=False, timeout=TIMEOUT) as r:
            if r.status != 200:
                return {'found': False, 'reason': 'numbuster_unavailable'}
            data = await r.json(content_type=None)
            name = data.get('name') or data.get('owner_name')
            return {
                'found': bool(name),
                'names': [name] if name else [],
                'platform': 'numbuster',
                'phone': phone,
            }
    except Exception as e:
        return {'found': False, 'reason': str(e)}

# ─── FACEBOOK ────────────────────────────────────────────────────────────────────
async def search_facebook_name(session: ClientSession, name: str) -> list:
    """Facebook пошук по імені через публічний Graph API"""
    try:
        fb_token = os.environ.get('FACEBOOK_ACCESS_TOKEN', '')
        if not fb_token:
            return []
        url = f"https://graph.facebook.com/search?q={name}&type=user&access_token={fb_token}"
        async with session.get(url, ssl=False, timeout=TIMEOUT) as r:
            if r.status != 200:
                return []
            data = await r.json(content_type=None)
            results = []
            for user in (data.get('data') or [])[:10]:
                results.append({
                    'fb_id': user.get('id'),
                    'name': user.get('name'),
                    'url': f"https://www.facebook.com/{user.get('id')}",
                    'platform': 'facebook',
                })
            return results
    except Exception as e:
        return []

# ─── USERNAME MULTI-SEARCH ──────────────────────────────────────────────────────
SHERLOCK_SITES = {
    'GitHub':     'https://github.com/{}',
    'Twitter/X':  'https://twitter.com/{}',
    'Reddit':     'https://reddit.com/user/{}',
    'Telegram':   'https://t.me/{}',
    'LinkedIn':   'https://linkedin.com/in/{}',
    'Pinterest':  'https://pinterest.com/{}',
    'Twitch':     'https://twitch.tv/{}',
    'YouTube':    'https://youtube.com/@{}',
    'Steam':      'https://steamcommunity.com/id/{}',
    'GitLab':     'https://gitlab.com/{}',
    'Medium':     'https://medium.com/@{}',
    'Patreon':    'https://patreon.com/{}',
    'Flickr':     'https://flickr.com/people/{}',
    'Tumblr':     'https://{}.tumblr.com',
    'Snapchat':   'https://snapchat.com/add/{}',
    'OK.ru':      'https://ok.ru/profile/{}',
}

async def check_username_site(session: ClientSession, platform: str, url_template: str, username: str) -> dict:
    url = url_template.format(username)
    try:
        async with session.get(url, headers=CHROME_HEADERS, ssl=False, timeout=ClientTimeout(total=8), allow_redirects=True) as r:
            if r.status in (200, 301, 302):
                # Перевіряємо що це не 404-under-200
                text = await r.text()
                not_found_signals = ['page not found', 'user not found', 'this account', 'does not exist',
                                     'страница не найдена', '404', 'не існує']
                lower = text.lower()[:2000]
                for sig in not_found_signals:
                    if sig in lower:
                        return {'platform': platform, 'found': False, 'url': url}
                return {'platform': platform, 'found': True, 'url': url, 'status': r.status}
            return {'platform': platform, 'found': False, 'url': url}
    except Exception:
        return {'platform': platform, 'found': False, 'url': url}

async def search_username_everywhere(username: str) -> list:
    async with ClientSession() as session:
        tasks = [
            check_username_site(session, platform, tmpl, username)
            for platform, tmpl in SHERLOCK_SITES.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        found = [r for r in results if isinstance(r, dict) and r.get('found')]
        return found

# ─── HTTP HANDLERS ───────────────────────────────────────────────────────────────

async def handle_instagram(request: web.Request) -> web.Response:
    body = await request.json()
    username = body.get('username', '').strip().lstrip('@')
    if not username:
        return web.json_response({'error': 'username required'}, status=400)
    async with ClientSession() as session:
        result = await search_instagram_username(session, username)
    return web.json_response(result)

async def handle_tiktok(request: web.Request) -> web.Response:
    body = await request.json()
    username = body.get('username', '').strip()
    if not username:
        return web.json_response({'error': 'username required'}, status=400)
    async with ClientSession() as session:
        result = await search_tiktok_username(session, username)
    return web.json_response(result)

async def handle_getcontact(request: web.Request) -> web.Response:
    body = await request.json()
    phone = body.get('phone', '').strip()
    if not phone:
        return web.json_response({'error': 'phone required'}, status=400)
    async with ClientSession() as session:
        result = await search_getcontact(session, phone)
    return web.json_response(result)

async def handle_facebook(request: web.Request) -> web.Response:
    body = await request.json()
    name = body.get('name', '').strip()
    if not name:
        return web.json_response({'error': 'name required'}, status=400)
    async with ClientSession() as session:
        results = await search_facebook_name(session, name)
    return web.json_response({'results': results, 'total': len(results)})

async def handle_username(request: web.Request) -> web.Response:
    body = await request.json()
    username = body.get('username', '').strip().lstrip('@')
    if not username or len(username) < 2:
        return web.json_response({'error': 'username required (min 2 chars)'}, status=400)
    results = await search_username_everywhere(username)
    return web.json_response({'found': results, 'total': len(results), 'checked': len(SHERLOCK_SITES)})

async def handle_all(request: web.Request) -> web.Response:
    """Пошук по всіх соцмережах одночасно"""
    body = await request.json()
    name = body.get('name', '').strip()
    username = body.get('username', '').strip().lstrip('@')
    phone = body.get('phone', '').strip()

    tasks = {}
    async with ClientSession() as session:
        coros = {}
        if username:
            coros['instagram'] = search_instagram_username(session, username)
            coros['tiktok'] = search_tiktok_username(session, username)
        if phone:
            coros['getcontact'] = search_getcontact(session, phone)
        if name:
            coros['facebook'] = search_facebook_name(session, name)

        results = {}
        if coros:
            gathered = await asyncio.gather(*coros.values(), return_exceptions=True)
            for key, res in zip(coros.keys(), gathered):
                results[key] = res if not isinstance(res, Exception) else {'error': str(res)}

        # Username everywhere (окремо бо інший session)
        if username:
            username_hits = await search_username_everywhere(username)
            results['username_search'] = username_hits

    return web.json_response({'results': results, 'searched': body})

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        'status': 'ok',
        'service': 'social-search',
        'platforms': ['instagram', 'tiktok', 'getcontact', 'facebook', 'username'],
        'getcontact_token': bool(os.environ.get('GETCONTACT_TOKEN')),
        'facebook_token': bool(os.environ.get('FACEBOOK_ACCESS_TOKEN')),
    })

# ─── APP ─────────────────────────────────────────────────────────────────────────
app = web.Application()
app.router.add_get('/health',               handle_health)
app.router.add_post('/social/instagram',    handle_instagram)
app.router.add_post('/social/tiktok',       handle_tiktok)
app.router.add_post('/social/getcontact',   handle_getcontact)
app.router.add_post('/social/facebook',     handle_facebook)
app.router.add_post('/social/username',     handle_username)
app.router.add_post('/social/all',          handle_all)

if __name__ == '__main__':
    log.info(f"Social Search service starting on port {PORT}")
    web.run_app(app, host='0.0.0.0', port=PORT)
