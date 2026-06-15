// app/api/crypto/news/route.ts
// Fetches crypto news from public RSS feeds — no API key required.
// Merges, sorts, and returns up to 60 articles with optional keyword filter.

import { NextRequest } from 'next/server'

export const dynamic   = 'force-dynamic'
export const revalidate = 300  // 5-min ISR cache

// ─── Feed registry ────────────────────────────────────────────────────────────

const FEEDS = [
  {
    url:    'https://cointelegraph.com/rss',
    name:   'CoinTelegraph',
    color:  '#00cc88',
    emoji:  '📰',
  },
  {
    url:    'https://decrypt.co/feed',
    name:   'Decrypt',
    color:  '#5c6bc0',
    emoji:  '🔓',
  },
  {
    url:    'https://bitcoinmagazine.com/feed',
    name:   'Bitcoin Magazine',
    color:  '#f7931a',
    emoji:  '₿',
  },
  {
    url:    'https://cryptopanic.com/news/rss/',
    name:   'CryptoPanic',
    color:  '#e65c00',
    emoji:  '⚡',
  },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id:          string
  title:       string
  link:        string
  pubDate:     string   // ISO or original string
  description: string
  source:      string
  color:       string
  emoji:       string
  tags:        string[] // detected topic tags
}

// ─── RSS parser ───────────────────────────────────────────────────────────────

function extractTag(block: string, tag: string): string {
  // Handles CDATA and plain text
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')
  const plainRe = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i')
  const cdataM  = cdataRe.exec(block)
  if (cdataM) return cdataM[1].trim()
  const plainM  = plainRe.exec(block)
  if (plainM)  return plainM[1].trim()
  return ''
}

function extractLink(block: string): string {
  // <link> in RSS can be CDATA or plain or self-closing before </item>
  const linkRe = /<link>([^<]+)<\/link>/i
  const m = linkRe.exec(block)
  if (m) return m[1].trim()
  // Try href attribute
  const hrefRe = /<link[^>]+href="([^"]+)"/i
  const hm = hrefRe.exec(block)
  if (hm) return hm[1].trim()
  return ''
}

function toISO(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch { /* skip */ }
  return dateStr
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function detectTags(title: string, desc: string): string[] {
  const text = (title + ' ' + desc).toLowerCase()
  const tags: string[] = []
  if (/sanction|ofac|ofat|blacklist|freeze|seized/i.test(text))      tags.push('sanctions')
  if (/russia|russian|rusia|kremlin|moscow|путин|росія/i.test(text)) tags.push('russia')
  if (/ukraine|ukrainian|київ|kyiv/i.test(text))                     tags.push('ukraine')
  if (/bitcoin|btc\b/i.test(text))                                   tags.push('btc')
  if (/ethereum|eth\b/i.test(text))                                   tags.push('eth')
  if (/usdt|tether|usdc|stablecoin/i.test(text))                     tags.push('usdt')
  if (/hack|exploit|breach|rug pull|scam|phish/i.test(text))         tags.push('hack')
  if (/whale|large transfer|million|billion/i.test(text))            tags.push('whale')
  if (/war crime|laundering|terror|illicit|money laund/i.test(text)) tags.push('illicit')
  return tags
}

function parseRSS(
  xml:   string,
  name:  string,
  color: string,
  emoji: string,
): NewsArticle[] {
  const articles: NewsArticle[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null

  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const title = stripHtml(extractTag(block, 'title'))
    const link  = extractLink(block) || extractTag(block, 'guid')
    if (!title || !link) continue

    const pubDateRaw = extractTag(block, 'pubDate') || extractTag(block, 'dc:date')
    const rawDesc    = extractTag(block, 'description') || extractTag(block, 'content:encoded')
    const description = stripHtml(rawDesc).slice(0, 300)
    const pubDate    = toISO(pubDateRaw)
    const tags       = detectTags(title, description)
    const id         = Buffer.from(link).toString('base64').slice(0, 16)

    articles.push({ id, title, link, pubDate, description, source: name, color, emoji, tags })
  }
  return articles
}

// ─── Fetch one feed (with timeout) ───────────────────────────────────────────

async function fetchFeed(feed: typeof FEEDS[number]): Promise<NewsArticle[]> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res   = await fetch(feed.url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'ODB-Platform/1.0 (news aggregator)' },
      next:    { revalidate: 300 },
    })
    clearTimeout(timer)
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml, feed.name, feed.color, feed.emoji)
  } catch {
    return []
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag    = searchParams.get('tag')   || ''   // e.g. 'sanctions'
  const limit  = Math.min(Number(searchParams.get('limit') || 40), 80)

  // Fetch all feeds in parallel
  const results = await Promise.all(FEEDS.map(fetchFeed))
  let articles: NewsArticle[] = results.flat()

  // Sort by date DESC
  articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

  // Dedupe by title similarity (first 40 chars)
  const seen = new Set<string>()
  articles = articles.filter(a => {
    const key = a.title.toLowerCase().slice(0, 40)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Apply tag filter
  if (tag) {
    articles = articles.filter(a => a.tags.includes(tag))
  }

  const total  = articles.length
  articles     = articles.slice(0, limit)

  return Response.json({
    articles,
    total,
    tag:       tag || null,
    sources:   FEEDS.map(f => ({ name: f.name, color: f.color, emoji: f.emoji })),
    fetchedAt: new Date().toISOString(),
  })
}
