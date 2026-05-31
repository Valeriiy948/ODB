#!/usr/bin/env python3
"""
VK API Proxy — запускається на VPS (Нідерланди) де VK не заблокований
Слухає на порту 8008, приймає запити від платформи і проксує до api.vk.com

Запуск:
  pip install flask requests
  VK_TOKEN=твій_токен python3 vk_proxy.py

Або як systemd сервіс (дивись vk_proxy.service)
"""

import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

VK_TOKEN = os.environ.get('VK_TOKEN', '')
VK_API   = 'https://api.vk.com/method'
VK_V     = '5.199'

def vk_call(method: str, params: dict):
    """Виклик VK API"""
    p = {**params, 'access_token': VK_TOKEN, 'v': VK_V}
    r = requests.get(f'{VK_API}/{method}', params=p, timeout=10)
    r.raise_for_status()
    data = r.json()
    if 'error' in data:
        raise Exception(data['error'].get('error_msg', 'VK error'))
    return data.get('response')

FIELDS = 'photo_200,city,country,bdate,domain,mobile_phone,occupation,followers_count,verified,last_seen,is_closed,deactivated'

def normalize(u: dict) -> dict:
    return {
        'id':          u.get('id'),
        'url':         f"https://vk.com/{u.get('domain') or 'id' + str(u.get('id', ''))}",
        'name':        f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
        'username':    u.get('domain'),
        'photo':       u.get('photo_200') or u.get('photo_100'),
        'city':        u.get('city', {}).get('title') if isinstance(u.get('city'), dict) else None,
        'country':     u.get('country', {}).get('title') if isinstance(u.get('country'), dict) else None,
        'bdate':       u.get('bdate'),
        'phone':       u.get('mobile_phone') or u.get('home_phone'),
        'followers':   u.get('followers_count', 0),
        'is_closed':   u.get('is_closed', False),
        'is_verified': u.get('verified') == 1,
        'last_seen':   u.get('last_seen', {}).get('time') if isinstance(u.get('last_seen'), dict) else None,
        'occupation':  u.get('occupation', {}).get('name') if isinstance(u.get('occupation'), dict) else None,
        'deactivated': u.get('deactivated'),
    }

@app.route('/vk/search', methods=['POST'])
def vk_search():
    if not VK_TOKEN:
        return jsonify({'error': 'no_token', 'message': 'VK_TOKEN не встановлений на VPS', 'entries': []})

    data = request.get_json() or {}
    query   = data.get('query', '').strip()
    qtype   = data.get('type', 'name')

    if not query:
        return jsonify({'error': 'query required', 'entries': []}), 400

    results = []
    seen_ids = set()

    try:
        # 1. Пошук за ім'ям
        if qtype in ('name', 'username', 'phone'):
            search_q = ' '.join(query.split()[:2])  # Ім'я + Прізвище
            resp = vk_call('users.search', {'q': search_q, 'fields': FIELDS, 'count': 20, 'sort': 0})
            for u in (resp or {}).get('items', []):
                if u['id'] not in seen_ids:
                    seen_ids.add(u['id'])
                    results.append(normalize(u))

        # 2. Пошук за screen_name (vk.com/username або просто username)
        if qtype in ('username', 'vk_url'):
            screen = query.replace('https://vk.com/', '').replace('http://vk.com/', '').replace('@', '').split('/')[0]
            try:
                resolved = vk_call('utils.resolveScreenName', {'screen_name': screen})
                if resolved and resolved.get('type') == 'user':
                    user_resp = vk_call('users.get', {'user_ids': resolved['object_id'], 'fields': FIELDS})
                    if user_resp and user_resp[0]['id'] not in seen_ids:
                        seen_ids.add(user_resp[0]['id'])
                        results.insert(0, normalize(user_resp[0]))
            except Exception:
                pass

    except Exception as e:
        return jsonify({'error': str(e), 'entries': []})

    return jsonify({'success': True, 'query': query, 'total': len(results), 'entries': results})

@app.route('/vk/api', methods=['POST'])
def vk_api_proxy():
    """Прямий проксі для довільних VK API методів"""
    if not VK_TOKEN:
        return jsonify({'error': 'no_token'}), 401

    data   = request.get_json() or {}
    method = data.get('method')
    params = data.get('params', {})
    params.pop('access_token', None)  # Не дозволяємо перезаписати токен

    if not method:
        return jsonify({'error': 'method required'}), 400

    try:
        resp = vk_call(method, params)
        return jsonify({'response': resp})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/vk/health', methods=['GET'])
def vk_health():
    if not VK_TOKEN:
        return jsonify({'ok': False, 'reason': 'no_token'})
    try:
        resp = vk_call('users.get', {'user_ids': '1'})
        return jsonify({'ok': True, 'token_works': bool(resp)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8008))
    print(f"[VK Proxy] Запуск на порту {port}")
    print(f"[VK Proxy] Токен: {'✓ встановлено' if VK_TOKEN else '✗ не встановлено'}")
    app.run(host='0.0.0.0', port=port, debug=False)
