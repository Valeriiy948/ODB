// app/api/network/ai-analyze/route.ts
// CTI Query Analyzer — конвертує природну мову у Shodan запити
// Rule-based + AI fallback (без офенсивних формулювань)

import { NextRequest, NextResponse } from 'next/server'

// ─── Rule-based CTI patterns ──────────────────────────────────────────────────

interface CtiRule {
  keywords:    string[]
  query:       string
  target_type: string
  cve:         string[]
  note:        string
  priority:    'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  alternatives?: string[]
}

const CTI_RULES: CtiRule[] = [
  // ── Військові / Міноборони РФ ─────────────────────────────────────────────
  {
    keywords:    ['мінооборони', 'міноборони', 'військов', 'mil.ru', 'army', 'defense', 'army.ru'],
    query:       'domain:mil.ru country:RU port:22,3389,80,443',
    target_type: 'Військова інфраструктура (mil.ru)',
    cve:         ['CVE-2019-0708 (BlueKeep/RDP)', 'CVE-2017-0144 (EternalBlue/SMB)', 'CVE-2023-23397 (Outlook)'],
    note:        'Домен mil.ru використовується Міністерством оборони РФ. Запит охоплює веб-сервіси та порти віддаленого керування. Рекомендується додатково перевірити SSL-сертифікати через ssl.cert.subject.cn:mil.ru.',
    priority:    'HIGH',
    alternatives: ['ssl.cert.subject.cn:mil.ru', 'org:"Ministry of Defence" country:RU', 'hostname:*.mil.ru'],
  },
  // ── RDP / Віддалений доступ ───────────────────────────────────────────────
  {
    keywords:    ['rdp', 'remote desktop', 'віддален', '3389'],
    query:       'port:3389 country:RU os:Windows',
    target_type: 'Сервери з відкритим RDP (Росія)',
    cve:         ['CVE-2019-0708 (BlueKeep)', 'CVE-2019-1181 (DejaBlue)', 'CVE-2020-0609 (RD Gateway)'],
    note:        'RDP порт 3389 є критичним вектором атак. BlueKeep (CVE-2019-0708) — незапатчені системи Windows 7/Server 2008. Рекомендується фільтрувати по org: для цільових організацій.',
    priority:    'CRITICAL',
    alternatives: ['port:3389 country:RU product:"Remote Desktop"', 'port:3389 country:RU os:"Windows Server 2008"'],
  },
  // ── SSH ───────────────────────────────────────────────────────────────────
  {
    keywords:    ['ssh', 'порт 22', 'port:22'],
    query:       'port:22 country:RU product:OpenSSH',
    target_type: 'SSH-сервери (Росія)',
    cve:         ['CVE-2023-38408 (OpenSSH agent)', 'CVE-2016-0777 (OpenSSH leak)', 'CVE-2023-48795 (Terrapin)'],
    note:        'SSH є стандартним протоколом адміністрування серверів. Застарілі версії OpenSSH мають критичні вразливості. Зверніть увагу на version:OpenSSH_7 та старіше.',
    priority:    'HIGH',
    alternatives: ['port:22 country:RU version:"OpenSSH_7"', 'port:22 org:Rostelecom'],
  },
  // ── SCADA / ICS / Промислові системи ─────────────────────────────────────
  {
    keywords:    ['scada', 'ics', 'промислов', 'critical infrastructure', 'критична', 'dnp3', 'modbus', 'siemens', 'schneider'],
    query:       'port:502,102,20000,44818 country:RU',
    target_type: 'Промислові системи SCADA/ICS (Росія)',
    cve:         ['CVE-2022-37954 (Siemens S7)', 'CVE-2020-7483 (Schneider EcoStruxure)', 'CVE-2021-27477 (Inductive Automation)'],
    note:        'Порти SCADA-систем: Modbus (502), Siemens S7 (102), DNP3 (20000), EtherNet/IP (44818). Незахищені промислові системи є критичними об\'єктами. Також перевірте product:"Tridium Niagara".',
    priority:    'CRITICAL',
    alternatives: ['product:"Tridium Niagara" country:RU', 'port:502 country:RU', 'port:102 country:RU org:Gazprom'],
  },
  // ── Бази даних без аутентифікації ─────────────────────────────────────────
  {
    keywords:    ['бази', 'база', 'database', 'elasticsearch', 'mongodb', 'redis', 'без паролю', 'відкрит', 'незахищен', 'open database', 'незахищена'],
    query:       'port:9200,27017,6379,5432,3306 country:RU',
    target_type: 'Незахищені бази даних (Росія)',
    cve:         ['CVE-2021-44228 (Log4Shell/ES)', 'CVE-2019-7401 (MongoDB auth bypass)', 'CVE-2022-0543 (Redis RCE)'],
    note:        'Відкриті бази даних — один з найпоширеніших витоків. Elasticsearch (9200), MongoDB (27017), Redis (6379), PostgreSQL (5432). Додайте фільтри product: для конкретних СУБД.',
    priority:    'HIGH',
    alternatives: ['product:Elasticsearch port:9200 country:RU', 'product:MongoDB port:27017 country:RU', 'port:6379 country:RU product:Redis'],
  },
  // ── Ростелеком ───────────────────────────────────────────────────────────
  {
    keywords:    ['ростелеком', 'rostelecom'],
    query:       'org:Rostelecom country:RU',
    target_type: 'Ростелеком — державний провайдер РФ',
    cve:         ['CVE-2021-44228 (Log4Shell)', 'CVE-2022-1388 (F5 BIG-IP)'],
    note:        'Ростелеком — найбільший держпровайдер РФ, обслуговує уряд та військових. Має власні AS (ASN 12389). Рекомендується поєднати з фільтрами портів для цільового пошуку.',
    priority:    'MEDIUM',
    alternatives: ['asn:AS12389', 'org:Rostelecom port:22,80,443,3389', 'org:Rostelecom product:nginx'],
  },
  // ── Voentelecom / Військовий зв'язок ─────────────────────────────────────
  {
    keywords:    ['воєнтелеком', 'voentelecom', 'військовий зв', 'military telecom'],
    query:       'org:"Voentelecom" country:RU',
    target_type: 'Воєнтелеком — військовий провайдер РФ',
    cve:         ['CVE-2023-23397 (Outlook/NTLM)', 'CVE-2017-0144 (EternalBlue)'],
    note:        'Воєнтелеком — оператор зв\'язку Збройних сил РФ. Обслуговує military.ru та суміжні домени. Варто перевірити SSL-сертифікати організації та хостнейми.',
    priority:    'HIGH',
    alternatives: ['org:"Voentelecom" port:22,3389', 'ssl.cert.subject.o:Voentelecom'],
  },
  // ── ФСБ / Спецслужби ─────────────────────────────────────────────────────
  {
    keywords:    ['фсб', 'fsb', 'спецслужби', 'спецслужб', 'fsb.ru', 'svr.ru', 'gru', 'фсо', 'гру', 'розвідк'],
    query:       'domain:fsb.ru OR domain:svr.gov.ru country:RU',
    target_type: 'Спецслужби РФ (ФСБ/СВР)',
    cve:         ['CVE-2023-23397 (Outlook/NTLM relay)', 'CVE-2021-26855 (ProxyLogon/Exchange)'],
    note:        'Домени fsb.ru та svr.gov.ru належать спецслужбам РФ. Веб-інфраструктура обмежена, проте можливий аналіз SSL-сертифікатів та хостнеймів.',
    priority:    'HIGH',
    alternatives: ['ssl.cert.subject.cn:fsb.ru', 'hostname:*.fsb.ru', 'domain:mvd.ru country:RU'],
  },
  // ── Gazprom / Нафтогаз ───────────────────────────────────────────────────
  {
    keywords:    ['газпром', 'gazprom', 'нафтогаз', 'нафто', 'лукойл', 'lukoil', 'роснефть', 'rosneft'],
    query:       'org:Gazprom country:RU port:80,443,22,3389',
    target_type: 'Енергетична інфраструктура РФ',
    cve:         ['CVE-2022-1388 (F5 BIG-IP)', 'CVE-2021-44228 (Log4Shell)', 'CVE-2022-37954 (ICS)'],
    note:        'Газпром та суміжні компанії — критична енергетична інфраструктура РФ. Для SCADA-систем використовуйте порти 502, 102. Перевірте org:"Gazprom Neft" та org:"Transneft".',
    priority:    'HIGH',
    alternatives: ['org:Gazprom port:502,102', 'org:"Lukoil" country:RU', 'org:Rosneft port:22'],
  },
  // ── VPN / Proxy servers ───────────────────────────────────────────────────
  {
    keywords:    ['vpn', 'proxy', 'проксі', 'fortinet', 'pulse secure', 'cisco vpn'],
    query:       'product:"Fortinet" OR product:"Pulse Secure" country:RU port:443,8443,10443',
    target_type: 'VPN-шлюзи (Росія)',
    cve:         ['CVE-2022-42475 (Fortinet SSL-VPN RCE)', 'CVE-2021-22893 (Pulse Connect Secure)', 'CVE-2023-27997 (FortiOS)'],
    note:        'VPN-шлюзи Fortinet та Pulse Secure мають критичні CVE. CVE-2022-42475 дозволяє RCE без аутентифікації у FortiOS. Рекомендується перевірити версії прошивки.',
    priority:    'CRITICAL',
    alternatives: ['product:FortiGate country:RU', 'http.title:"SSL-VPN" country:RU', 'product:"Cisco ASA" country:RU'],
  },
  // ── Web servers / Apache / IIS ────────────────────────────────────────────
  {
    keywords:    ['apache', 'iis', 'веб-сервер', 'web server', 'застарілий', 'старий', 'старих'],
    query:       'product:Apache country:RU version:2.2,2.4.49,2.4.50',
    target_type: 'Застарілі веб-сервери (Росія)',
    cve:         ['CVE-2021-41773 (Apache path traversal)', 'CVE-2021-42013 (Apache RCE)', 'CVE-2021-34527 (PrintNightmare)'],
    note:        'Apache 2.4.49 та 2.4.50 мають критичну path traversal вразливість (CVE-2021-41773). Для IIS шукайте product:"Microsoft IIS" version:7.5,8.0.',
    priority:    'HIGH',
    alternatives: ['product:"Microsoft IIS" country:RU version:7.5', 'product:Apache country:RU http.status:200'],
  },
  // ── Log4Shell ────────────────────────────────────────────────────────────
  {
    keywords:    ['log4shell', 'log4j', 'cve-2021-44228'],
    query:       'vuln:CVE-2021-44228 country:RU',
    target_type: 'Log4Shell вразливі хости (Росія)',
    cve:         ['CVE-2021-44228 (Log4Shell)', 'CVE-2021-45046 (Log4j bypass)', 'CVE-2021-45105 (Log4j DoS)'],
    note:        'Log4Shell (CVE-2021-44228) — критична RCE в Apache Log4j. Зачіпає Java-додатки: VMware vCenter, Cisco, Apache Struts. Shodan індексує хости з цією вразливістю при наявності Shodan Monitor.',
    priority:    'CRITICAL',
    alternatives: ['vuln:CVE-2021-44228', 'product:VMware country:RU', 'product:"Apache Struts" country:RU'],
  },
  // ── Камери / IoT ─────────────────────────────────────────────────────────
  {
    keywords:    ['камер', 'camera', 'відеоспостереж', 'cctv', 'iot', 'dahua', 'hikvision'],
    query:       'product:Hikvision OR product:Dahua country:RU port:80,554,8000',
    target_type: 'Відеокамери та IoT пристрої (Росія)',
    cve:         ['CVE-2021-36260 (Hikvision RCE)', 'CVE-2021-33044 (Dahua auth bypass)', 'CVE-2022-28173 (Hikvision)'],
    note:        'Hikvision та Dahua — найпоширеніші вразливі камери в РФ. CVE-2021-36260 дозволяє повний контроль без аутентифікації. RTSP-потоки на порту 554.',
    priority:    'HIGH',
    alternatives: ['http.title:"Hikvision" country:RU', 'port:554 country:RU product:RTSP', 'product:"DVR" country:RU'],
  },
  // ── Default / загальний запит ─────────────────────────────────────────────
  {
    keywords:    [],  // catch-all
    query:       'country:RU port:80,443,22',
    target_type: 'Загальний пошук (Росія)',
    cve:         ['CVE-2021-44228 (Log4Shell)', 'CVE-2022-1388 (F5)', 'CVE-2023-23397 (Outlook)'],
    note:        'Загальний запит до російської інфраструктури. Уточніть запит, додавши: назву організації (org:), домен (domain:), порт (port:) або продукт (product:) для більш точного пошуку.',
    priority:    'LOW',
    alternatives: ['country:RU org:Rostelecom', 'country:RU port:3389', 'country:RU product:nginx'],
  },
]

// ─── Match query to rule ──────────────────────────────────────────────────────

function matchRule(query: string): CtiRule {
  const q = query.toLowerCase()
  for (const rule of CTI_RULES) {
    if (rule.keywords.length === 0) continue
    if (rule.keywords.some(kw => q.includes(kw.toLowerCase()))) {
      return rule
    }
  }
  // Return catch-all
  return CTI_RULES[CTI_RULES.length - 1]
}

// ─── Optional Claude AI enrichment ───────────────────────────────────────────

const ANALYST_PROMPT = `You are a network security researcher helping document and analyze public infrastructure for OSINT research purposes.

Given a target description, generate a JSON response with:
- search_query: a Shodan search query string
- target_type: brief classification in Ukrainian
- potential_cve: array of relevant CVE IDs with names
- analytical_note: 2-3 sentence explanation in Ukrainian
- alternative_queries: 2 alternative Shodan queries
- priority: CRITICAL/HIGH/MEDIUM/LOW

Return ONLY valid JSON, no markdown or extra text.`

async function enrichWithAI(query: string, baseRule: CtiRule): Promise<CtiRule | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 800,
        system:     ANALYST_PROMPT,
        messages:   [{
          role:    'user',
          content: `OSINT research query: "${query}"\n\nBase Shodan filter: ${baseRule.query}`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return null
    const data    = await res.json()
    const rawText = data.content?.[0]?.text || ''

    // Parse JSON
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (!parsed.search_query) return null

    return {
      keywords:    baseRule.keywords,
      query:       parsed.search_query,
      target_type: parsed.target_type      || baseRule.target_type,
      cve:         parsed.potential_cve    || baseRule.cve,
      note:        parsed.analytical_note  || baseRule.note,
      priority:    parsed.priority         || baseRule.priority,
      alternatives: parsed.alternative_queries || baseRule.alternatives,
    }
  } catch {
    return null
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { query, use_ai = true } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    const q = String(query).trim()

    // Step 1: Rule-based match (always works, instant)
    const baseRule = matchRule(q)

    // Step 2: Try AI enrichment (optional, may fail gracefully)
    let finalRule = baseRule
    if (use_ai) {
      const aiRule = await enrichWithAI(q, baseRule)
      if (aiRule) finalRule = aiRule
    }

    return NextResponse.json({
      success:          true,
      query:            q,
      search_query:     finalRule.query,
      target_type:      finalRule.target_type,
      potential_cve:    finalRule.cve,
      analytical_note:  finalRule.note,
      alternative_queries: finalRule.alternatives || [],
      priority:         finalRule.priority,
      source:           finalRule === baseRule ? 'rule_based' : 'ai_enriched',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, success: false }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status:  'ok',
    mode:    'rule_based + optional AI enrichment',
    rules:   CTI_RULES.filter(r => r.keywords.length > 0).map(r => ({
      keywords: r.keywords.slice(0, 3),
      priority: r.priority,
      target:   r.target_type,
    })),
  })
}
