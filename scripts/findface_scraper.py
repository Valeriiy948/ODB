#!/usr/bin/env python3
"""
FindFace / FindClone scraper через Selenium undetected-chromedriver
Запуск: python3 findface_scraper.py --server --port 8004

Вимоги на VPS:
  pip3 install aiohttp selenium undetected-chromedriver pillow requests
  apt install chromium-chromedriver
"""

import asyncio
import os
import json
import re
import time
import argparse
import tempfile
import urllib.request
from aiohttp import web, ClientTimeout
from concurrent.futures import ThreadPoolExecutor

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    UC_AVAILABLE = True
except ImportError:
    UC_AVAILABLE = False
    print('WARNING: undetected_chromedriver not available. Install: pip3 install undetected-chromedriver selenium')

executor = ThreadPoolExecutor(max_workers=2)

def download_photo(photo_url: str) -> str:
    """Скачуємо фото у тимчасовий файл, повертаємо шлях"""
    tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    req = urllib.request.Request(photo_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        tmp.write(resp.read())
    tmp.close()
    return tmp.name


def _sync_findclone_search(photo_url: str) -> list:
    """Синхронний пошук у findclone.ru"""
    if not UC_AVAILABLE:
        return []

    photo_path = None
    driver = None
    try:
        photo_path = download_photo(photo_url)

        options = uc.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--headless=new')
        options.add_argument('--window-size=1280,800')

        driver = uc.Chrome(options=options)
        driver.set_page_load_timeout(30)

        # Відкриваємо findclone
        driver.get('https://findclone.ru/')
        time.sleep(2)

        # Завантажуємо фото
        upload_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="file"]'))
        )
        upload_input.send_keys(photo_path)
        time.sleep(3)

        # Чекаємо результатів
        WebDriverWait(driver, 60).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '.result, .person-card, .vk-result, [class*="result"]'))
        )

        results = []
        # Парсимо картки результатів
        cards = driver.find_elements(By.CSS_SELECTOR, '.result-item, .person, [class*="card"], a[href*="vk.com"]')
        for card in cards[:15]:
            try:
                link = card.get_attribute('href') or card.find_element(By.TAG_NAME, 'a').get_attribute('href')
                name_el = card.find_elements(By.CSS_SELECTOR, '.name, h3, h4, strong')
                name = name_el[0].text.strip() if name_el else None
                sim_el = card.find_elements(By.CSS_SELECTOR, '.similarity, .percent, [class*="sim"]')
                similarity = None
                if sim_el:
                    m = re.search(r'(\d+)', sim_el[0].text)
                    if m: similarity = int(m.group(1))
                img_el = card.find_elements(By.TAG_NAME, 'img')
                photo = img_el[0].get_attribute('src') if img_el else None

                if link and 'vk.com' in link:
                    results.append({
                        'source':      'vk',
                        'profile_url': link,
                        'name':        name,
                        'similarity':  similarity,
                        'photo_url':   photo,
                    })
                elif link:
                    results.append({
                        'source':      'findclone',
                        'profile_url': link,
                        'name':        name,
                        'similarity':  similarity,
                        'photo_url':   photo,
                    })
            except Exception:
                continue

        return results

    except Exception as e:
        print(f'FindClone error: {e}')
        return []
    finally:
        if driver:
            try: driver.quit()
            except: pass
        if photo_path and os.path.exists(photo_path):
            os.unlink(photo_path)


def _sync_findface_search(photo_url: str) -> list:
    """
    Синхронний пошук через FindFace (якщо є API або через search.goolge Images)
    Fallback: пошук по фото у Yandex Images
    """
    if not UC_AVAILABLE:
        return []

    photo_path = None
    driver = None
    try:
        photo_path = download_photo(photo_url)

        options = uc.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--headless=new')
        options.add_argument('--window-size=1280,800')
        options.add_argument('--lang=ru-RU')

        driver = uc.Chrome(options=options)
        driver.set_page_load_timeout(30)

        # Яндекс-пошук по картинці
        driver.get('https://yandex.ru/images/')
        time.sleep(2)

        try:
            # Кнопка "пошук по зображенню"
            camera_btn = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, '.cbir-button, [class*="camera"], .input__search-button'))
            )
            camera_btn.click()
            time.sleep(1)
        except Exception:
            # Альтернатива: drag&drop / URL upload
            driver.get('https://yandex.ru/images/search?rpt=imageview&url=' + urllib.parse.quote(photo_url))
            time.sleep(3)

        results = []

        # Парсимо "Люди на фото" секцію
        try:
            people = driver.find_elements(By.CSS_SELECTOR, '.CbirPeople-Item, [class*="people"], .cbir-person')
            for p in people[:10]:
                link_el = p.find_elements(By.TAG_NAME, 'a')
                name_el = p.find_elements(By.CSS_SELECTOR, '.CbirPeople-Name, span, strong')
                photo_el = p.find_elements(By.TAG_NAME, 'img')
                results.append({
                    'source':      'yandex_faces',
                    'profile_url': link_el[0].get_attribute('href') if link_el else None,
                    'name':        name_el[0].text.strip() if name_el else None,
                    'photo_url':   photo_el[0].get_attribute('src') if photo_el else None,
                    'similarity':  None,
                })
        except Exception:
            pass

        return [r for r in results if r.get('profile_url')]

    except Exception as e:
        print(f'FindFace/Yandex error: {e}')
        return []
    finally:
        if driver:
            try: driver.quit()
            except: pass
        if photo_path and os.path.exists(photo_path):
            os.unlink(photo_path)


# ── HTTP сервер ───────────────────────────────────────────────────────────────

async def handle_findclone(request: web.Request) -> web.Response:
    try:
        body      = await request.json()
        photo_url = body.get('photo_url', '')
        if not photo_url:
            return web.json_response({'error': 'photo_url required'}, status=400)

        loop    = asyncio.get_event_loop()
        results = await loop.run_in_executor(executor, _sync_findclone_search, photo_url)
        return web.json_response({'success': True, 'results': results, 'source': 'findclone'})

    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_findface(request: web.Request) -> web.Response:
    try:
        body      = await request.json()
        photo_url = body.get('photo_url', '')
        if not photo_url:
            return web.json_response({'error': 'photo_url required'}, status=400)

        loop    = asyncio.get_event_loop()
        results = await loop.run_in_executor(executor, _sync_findface_search, photo_url)
        return web.json_response({'success': True, 'results': results, 'source': 'findface'})

    except Exception as e:
        return web.json_response({'error': str(e), 'results': []}, status=500)


async def handle_health(request):
    return web.json_response({
        'status':  'ok',
        'service': 'findface-scraper',
        'uc_available': UC_AVAILABLE,
    })


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', action='store_true')
    parser.add_argument('--port',   type=int, default=8004)
    parser.add_argument('--photo',  help='URL фото для тестування')
    args = parser.parse_args()

    if args.server:
        app = web.Application()
        app.router.add_post('/search/face',      handle_findface)
        app.router.add_post('/search/findclone', handle_findclone)
        app.router.add_get('/health',            handle_health)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', args.port)
        await site.start()
        print(f'FindFace scraper running on port {args.port}')
        print(f'undetected_chromedriver: {"OK" if UC_AVAILABLE else "NOT INSTALLED"}')
        await asyncio.Event().wait()
    elif args.photo:
        print('Searching FindClone...')
        results = _sync_findclone_search(args.photo)
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        parser.print_help()

if __name__ == '__main__':
    import urllib.parse
    asyncio.run(main())
