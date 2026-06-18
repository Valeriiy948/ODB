// app/api/persons/[id]/dossier/route.ts
// Генерує DOCX-досьє на особу: ідентифікація, контакти, зв'язки, крипто, інциденти

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── helpers ──────────────────────────────────────────────────────────────────

function safe(v: unknown): string {
  if (v == null) return '—'
  return String(v).trim() || '—'
}

function formatDate(d?: string | null): string {
  if (!d) return '—'
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C41E3A', space: 4 },
    },
    run: { color: 'C41E3A', bold: true, size: 22 },
  })
}

function para(text: string, opts: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        color: opts.color,
        size: opts.size ?? 20,
        italics: opts.italic,
      }),
    ],
    spacing: { after: 60 },
  })
}

function fieldRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, color: '555555' })] })],
        width: { size: 2400, type: WidthType.DXA },
        borders: cellBorder(),
        shading: { fill: 'F8F8F8' },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 18 })] })],
        width: { size: 6400, type: WidthType.DXA },
        borders: cellBorder(),
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
      }),
    ],
  })
}

function cellBorder() {
  return {
    top:    { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    left:   { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' },
    right:  { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' },
  }
}

function fieldTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: rows.filter(([, v]) => v && v !== '—').map(([l, v]) => fieldRow(l, v)),
  })
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB', space: 4 } },
    spacing: { after: 160 },
    children: [],
  })
}

function bullet(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: `▸  ${text}`, size: 19 })],
    spacing: { after: 60 },
    indent: { left: convertInchesToTwip(0.2) },
  })
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [
    { data: person },
    { data: connections },
    { data: incidentLinks },
    { data: wallets },
  ] = await Promise.all([
    supabase.from('persons').select('*').eq('id', id).single(),
    supabase
      .from('connections')
      .select(`rel_type, notes, confidence,
               person_a:persons!connections_person_a_fkey(id,name_ukr,name_rus,rank,unit),
               person_b:persons!connections_person_b_fkey(id,name_ukr,name_rus,rank,unit)`)
      .or(`person_a.eq.${id},person_b.eq.${id}`)
      .limit(20),
    supabase
      .from('incident_persons')
      .select('role, incident:incidents(title,date,location,inc_type,severity,icc_article,description)')
      .eq('person_id', id)
      .limit(15),
    supabase
      .from('crypto_wallets')
      .select('address, blockchain, risk_score, last_balance_usd, label')
      .eq('person_id', id)
      .limit(10),
  ])

  if (!person) return new NextResponse('Not Found', { status: 404 })

  const name = person.name_ukr || person.name_rus || person.name || '—'
  const now = new Date().toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const reportId = `ODB-${Date.now().toString(36).toUpperCase()}`

  const phones: string[] = Array.isArray(person.phones) ? [...person.phones] : []
  const connectionList = connections || []
  const incidents = (incidentLinks || [])
    .map((ip: { role?: string; incident: unknown }) => ({ ...(ip.incident as object), pivot_role: ip.role }))
    .filter(Boolean)
  const walletList = wallets || []

  // Threat label
  const score = person.threat_score ?? 0
  let threatLabel = 'НЕВИЗНАЧЕНА'
  if (score >= 75) threatLabel = 'КРИТИЧНА'
  else if (score >= 50) threatLabel = 'ВИСОКА'
  else if (score >= 25) threatLabel = 'СЕРЕДНЯ'
  else if (score > 0)   threatLabel = 'НИЗЬКА'

  // ─── Build document ────────────────────────────────────────────────────────

  const children: (Paragraph | Table)[] = []

  // ── 1. Заголовок ──────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'ДСК — ДЛЯ СЛУЖБОВОГО КОРИСТУВАННЯ', bold: true, size: 16, color: 'C41E3A', allCaps: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'АНАЛІТИЧНЕ ДОСЬЄ', bold: true, size: 36, color: '1A1A1A' })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: name, bold: true, size: 28, color: '1E3A5F' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Звіт: ${reportId}  ·  Складено: ${now}  ·  ODB Platform`, size: 16, color: '999999' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    divider(),
  )

  // ── 2. Рівень загрози ─────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'РІВЕНЬ ЗАГРОЗИ:  ', bold: true, size: 24 }),
        new TextRun({ text: threatLabel, bold: true, size: 26, color: score >= 50 ? 'C41E3A' : score >= 25 ? 'D97706' : '16A34A' }),
        new TextRun({ text: `   (${score}/100)`, size: 20, color: '666666' }),
      ],
      spacing: { after: 80 },
      border: {
        left: { style: BorderStyle.THICK, size: 12, color: score >= 50 ? 'C41E3A' : 'D97706', space: 8 },
      },
      indent: { left: 160 },
    }),
    divider(),
  )

  // ── 3. Ідентифікація ──────────────────────────────────────────────────────
  children.push(heading('1. Ідентифікаційні дані'))
  children.push(fieldTable([
    ['ПІБ', name],
    ['Дата народження', formatDate(person.dob)],
    ['Стать', person.gender === 'male' ? 'Чоловіча' : person.gender === 'female' ? 'Жіноча' : '—'],
    ['Громадянство', safe(person.nationality || person.citizenship)],
    ['Паспорт', safe(person.passport)],
    ['ІПН/ІНН', safe(person.ipn || person.inn_ru)],
    ['СНІЛС', safe(person.snils)],
    ['Адреса реєстрації', safe(person.addr_reg)],
    ['Адреса проживання', safe(person.addr_live)],
  ]))

  // ── 4. Військові дані ─────────────────────────────────────────────────────
  if (person.rank || person.unit || person.position) {
    children.push(heading('2. Військові дані'))
    children.push(fieldTable([
      ['Звання', safe(person.rank)],
      ['Підрозділ', safe(person.unit)],
      ['Номер в/ч', safe(person.unit_num)],
      ['Посада', safe(person.position)],
      ['Регіон', safe(person.region)],
      ['Статус', safe(person.status)],
    ]))
  }

  // ── 5. Контакти ───────────────────────────────────────────────────────────
  if (phones.length || person.email || person.telegram_username) {
    children.push(heading('3. Контактні дані'))
    const contactRows: [string, string][] = []
    if (phones.length) contactRows.push(['Телефони', phones.join('\n')])
    if (person.email) contactRows.push(['Email', safe(person.email)])
    if (person.telegram_username) contactRows.push(['Telegram', safe(person.telegram_username)])
    if (person.vk_url) contactRows.push(['VK', safe(person.vk_url)])
    children.push(fieldTable(contactRows))
  }

  // ── 6. Пов'язані особи ────────────────────────────────────────────────────
  const sectionNum = (person.rank || person.unit) ? 4 : 3
  if (connectionList.length) {
    children.push(heading(`${sectionNum}. Пов'язані особи (${connectionList.length})`))
    for (const c of (connectionList.slice(0, 12) as unknown as { person_a: { id: string; name_ukr?: string; name_rus?: string; rank?: string; unit?: string } | null; person_b: { id: string; name_ukr?: string; name_rus?: string; rank?: string; unit?: string } | null; rel_type?: string; notes?: string }[])) {
      const other = c.person_a?.id === id ? c.person_b : c.person_a
      if (!other) continue
      const otherName = other.name_ukr || other.name_rus || '—'
      const detail = [other.rank, other.unit].filter(Boolean).join(', ')
      children.push(bullet(`${c.rel_type || 'зв\'язок'}:  ${otherName}${detail ? `  (${detail})` : ''}${c.notes ? `  — ${c.notes}` : ''}`))
    }
    children.push(new Paragraph({ children: [], spacing: { after: 80 } }))
  }

  // ── 7. Крипто-гаманці ────────────────────────────────────────────────────
  if (walletList.length) {
    children.push(heading(`${sectionNum + 1}. Крипто-гаманці (${walletList.length})`))
    for (const w of walletList as { blockchain?: string; address?: string; label?: string; risk_score?: number; last_balance_usd?: number }[]) {
      const risk = w.risk_score ?? 0
      const riskStr = risk >= 70 ? 'ВИСОКИЙ РИЗИК' : risk >= 40 ? 'СЕРЕДНІЙ РИЗИК' : 'НИЗЬКИЙ РИЗИК'
      const balance = w.last_balance_usd != null ? `$${w.last_balance_usd.toLocaleString('uk-UA')}` : '—'
      const label = w.label ? `  [${w.label}]` : ''
      children.push(bullet(`${w.blockchain ?? '?'}:  ${w.address ?? '—'}${label}  |  ${riskStr}  |  Баланс: ${balance}`))
    }
    children.push(new Paragraph({ children: [], spacing: { after: 80 } }))
  }

  // ── 8. Інциденти ─────────────────────────────────────────────────────────
  if (incidents.length) {
    children.push(heading(`${sectionNum + 2}. Злочини та інциденти (${incidents.length})`))
    for (const inc of incidents as { title?: string; date?: string; location?: string; inc_type?: string; severity?: string; icc_article?: string; description?: string; pivot_role?: string }[]) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: safe(inc.title), bold: true, size: 20 })],
          spacing: { before: 120, after: 40 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: [formatDate(inc.date), inc.location, inc.inc_type, `Роль: ${safe(inc.pivot_role)}`].filter(Boolean).join('  ·  '),
            size: 17, color: '666666',
          })],
          spacing: { after: 40 },
        }),
      )
      if (inc.icc_article) {
        children.push(para(`МКС: ${inc.icc_article}`, { color: 'C41E3A', bold: true, size: 18 }))
      }
      if (inc.description) {
        children.push(para(inc.description.slice(0, 400) + (inc.description.length > 400 ? '…' : ''), { color: '444444', size: 18, italic: true }))
      }
      children.push(divider())
    }
  }

  // ── 9. Нотатки аналітика ─────────────────────────────────────────────────
  const notes = person.analyst_notes || person.notes
  if (notes) {
    children.push(heading(`${sectionNum + 3}. Нотатки аналітика`))
    for (const line of notes.split('\n').filter(Boolean)) {
      children.push(para(line, { color: '444444', italic: true }))
    }
  }

  // ── 10. Підпис ────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({ children: [], spacing: { before: 480, after: 0 } }),
    new Paragraph({
      children: [new TextRun({ text: 'Склав: _____________________________________ (підпис, дата)', size: 18, color: '666666' })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Затвердив: _________________________________ (підпис, дата)', size: 18, color: '666666' })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `Звіт: ${reportId}  ·  ${now}  ·  ODB Platform  ·  Для службового використання`,
        size: 14, color: 'AAAAAA',
      })],
      alignment: AlignmentType.CENTER,
    }),
  )

  // ─── Pack ──────────────────────────────────────────────────────────────────
  const doc = new Document({
    creator: 'ODB Platform',
    title: `Досьє: ${name}`,
    description: `Аналітичне досьє. Звіт ${reportId}`,
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 20, color: '111111' },
        },
        heading1: {
          run: { font: 'Arial', bold: true, size: 32, color: '1A1A1A' },
        },
        heading2: {
          run: { font: 'Arial', bold: true, size: 22, color: 'C41E3A', allCaps: true },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1.2),
            right:  convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const uint8 = new Uint8Array(buffer)
  const safeFilename = name.replace(/[^\wа-яА-ЯіІїЇєЄ'\s]/g, '').slice(0, 50).trim().replace(/\s+/g, '_')

  return new NextResponse(uint8, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="dosye_${safeFilename}_${new Date().toISOString().slice(0, 10)}.docx"`,
      'Cache-Control':       'no-store',
    },
  })
}
