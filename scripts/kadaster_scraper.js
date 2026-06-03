#!/usr/bin/env node
// scripts/kadaster_scraper.js
// Кадастровий пошук нерухомості по ПІБ через hsc.gov.ua
// Запуск: node kadaster_scraper.js --name "Іванов Іван Іванович" --dob "01.01.1980"
// HTTP сервер: node kadaster_scraper.js --server --port 8002

const http  = require('http')
const url   = require('url')

// Спробуємо знайти puppeteer або використаємо playwright
let puppeteer
try {
  puppeteer = require('puppeteer-core')
} catch {
  try {
    puppeteer = require('puppeteer')
  } catch {
    console.error('puppeteer not found, install: npm install puppeteer')
    process.exit(1)
  }
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH ||
  '/usr/bin/chromium-browser' ||
  '/usr/bin/chromium' ||
  '/snap/bin/chromium'

async function searchKadaster(name, dob) {
  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    })

    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    await page.setDefaultTimeout(30000)

    // Переходимо на сторінку пошуку
    await page.goto('https://hsc.gov.ua/search', { waitUntil: 'networkidle2' })

    // Шукаємо поле введення ПІБ
    const nameSelectors = ['input[name="name"]', 'input[placeholder*="ПІБ"]', '#name', '.name-input']
    let nameInput = null
    for (const sel of nameSelectors) {
      nameInput = await page.$(sel)
      if (nameInput) break
    }

    if (!nameInput) {
      // Fallback — пряме API hsc.gov.ua якщо є
      return await searchKadasterAPI(name, dob)
    }

    await nameInput.type(name, { delay: 50 })

    // Дата народження
    if (dob) {
      const dobSelectors = ['input[name="dob"]', 'input[type="date"]', '#dob']
      for (const sel of dobSelectors) {
        const dobInput = await page.$(sel)
        if (dobInput) {
          await dobInput.type(dob, { delay: 30 })
          break
        }
      }
    }

    // Натискаємо "Пошук"
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"], .search-btn, #search-btn'),
    ])

    // Парсимо результати
    const results = await page.evaluate(() => {
      const items = []
      document.querySelectorAll('.result-item, .property-card, tr.result').forEach(el => {
        items.push({
          cadastral_number: el.querySelector('.cadastral, [data-field="cadastral"]')?.textContent?.trim(),
          address:          el.querySelector('.address, [data-field="address"]')?.textContent?.trim(),
          area:             el.querySelector('.area, [data-field="area"]')?.textContent?.trim(),
          type:             el.querySelector('.type, [data-field="type"]')?.textContent?.trim(),
          owner:            el.querySelector('.owner, [data-field="owner"]')?.textContent?.trim(),
          raw:              el.innerText?.slice(0, 300),
        })
      })
      return items
    })

    await browser.close()
    return { success: true, results, source: 'hsc.gov.ua' }

  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    return { success: false, error: err.message, results: [] }
  }
}

// Fallback через відкриті кадастрові дані
async function searchKadasterAPI(name, dob) {
  try {
    // Кадастровий реєстр через публічну карту
    const params = new URLSearchParams({ fullname: name })
    if (dob) params.set('dob', dob)

    const response = await fetch(`https://e.land.gov.ua/back/cadaster/?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return { success: false, results: [], error: 'API unavailable' }
    const data = await response.json()

    const results = (data.features || data.results || []).map(f => ({
      cadastral_number: f.properties?.cadnum || f.cadnum,
      address:          f.properties?.address || f.address,
      area:             f.properties?.area_ha || f.area,
      type:             f.properties?.use_code_ua || f.type,
    }))

    return { success: true, results, source: 'e.land.gov.ua' }
  } catch (err) {
    return { success: false, error: err.message, results: [] }
  }
}

// HTTP сервер
const args = process.argv.slice(2)
const isServer = args.includes('--server')
const port = parseInt(args[args.indexOf('--port') + 1] || '8002')

if (isServer) {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true)

    if (req.method === 'POST' && parsedUrl.pathname === '/search/kadaster') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', async () => {
        try {
          const { name, dob } = JSON.parse(body)
          if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'name required' }))
            return
          }
          const result = await searchKadaster(name, dob)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', service: 'kadaster-scraper' }))
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`Kadaster scraper server running on port ${port}`)
    console.log(`Endpoint: POST /search/kadaster  body: {name, dob?}`)
  })

} else {
  // CLI mode
  const nameIdx = args.indexOf('--name')
  const dobIdx  = args.indexOf('--dob')
  const name    = nameIdx >= 0 ? args[nameIdx + 1] : null
  const dob     = dobIdx  >= 0 ? args[dobIdx  + 1] : null

  if (!name) {
    console.error('Usage: node kadaster_scraper.js --name "ПІБ" [--dob "01.01.1980"]')
    console.error('       node kadaster_scraper.js --server [--port 8002]')
    process.exit(1)
  }

  searchKadaster(name, dob).then(result => {
    console.log(JSON.stringify(result, null, 2))
  })
}
