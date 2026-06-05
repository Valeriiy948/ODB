import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle,
} from 'docx'
import { format } from 'date-fns'

function cell(text: string, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '—'), bold, size: 20 })] })],
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  })
}

function heading1(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER })
}

function heading2(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } })
}

function para(text: string, bold = false) {
  return new Paragraph({ children: [new TextRun({ text, bold, size: 22 })] })
}

function emptyLine() {
  return new Paragraph({ text: '' })
}

function infoRow(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: value || '—', size: 22 }),
    ],
  })
}

export async function generateCryptoReport(params: {
  address:    string
  chain:      string
  riskScore:  number
  verdict:    string
  walletData: any
  traceData:  any
  reportData: any
}): Promise<Blob> {
  const { address, chain, riskScore, verdict, walletData, traceData, reportData } = params
  const r = reportData?.report || {}
  const now = format(new Date(), 'dd.MM.yyyy HH:mm')
  const txRows: TableRow[] = []

  // Wallet API повертає { wallet: {...}, address, chain, risk_score }
  // Підтримуємо обидва формати: плаский (старий) і вкладений (новий)
  const w = walletData?.wallet || walletData || {}

  // Build tx table from recent_txs
  const txs: any[] = w?.recent_txs || w?.transactions || walletData?.recent_txs || []
  if (txs.length) {
    txRows.push(
      new TableRow({
        children: [cell('Дата/час', true), cell('Напрям', true), cell('Сума', true), cell('Hash / ID', true)],
        tableHeader: true,
      })
    )
    txs.slice(0, 20).forEach(tx => {
      txRows.push(new TableRow({
        children: [
          cell(tx.timestamp ? format(new Date(tx.timestamp * 1000), 'dd.MM.yyyy HH:mm') : (tx.date || '—')),
          cell(tx.direction || '—'),
          cell(tx.value_usdt != null ? `${tx.value_usdt} USDT` : tx.value_eth != null ? `${tx.value_eth} ETH` : (tx.amount || '—')),
          cell((tx.hash || tx.tx_hash || '—').slice(0, 42)),
        ],
      }))
    })
  }

  // Trace nodes table
  const traceNodes: any[] = traceData ? Object.values(traceData.nodes || {}) : []
  const traceRows: TableRow[] = []
  if (traceNodes.length) {
    traceRows.push(
      new TableRow({
        children: [cell('Адреса', true), cell('Глибина', true), cell('Надіслано', true), cell('Отримано', true), cell('Прапори', true)],
        tableHeader: true,
      })
    )
    traceNodes.forEach((n: any) => {
      traceRows.push(new TableRow({
        children: [
          cell(n.address),
          cell(String(n.depth)),
          cell(String(n.sent)),
          cell(String(n.received)),
          cell((n.flags || []).join(', ') || '—'),
        ],
      }))
    })
  }

  const fraudItems: Paragraph[] = (r.fraud_indicators || []).map((fi: any, i: number) =>
    para(`${i + 1}. [${(fi.severity || '').toUpperCase()}] ${fi.indicator} — ${fi.evidence || ''}`)
  )

  const recoItems: Paragraph[] = (r.recommendations || []).map((rec: string, i: number) =>
    para(`${i + 1}. ${rec}`)
  )

  const timelineItems: Paragraph[] = (r.timeline || []).map((ev: any) =>
    para(`${ev.date || '—'} — ${ev.event || ''}`)
  )

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        heading1('ДОВІДКА ЗА РЕЗУЛЬТАТАМИ OSINT-АНАЛІЗУ'),
        heading1('КРИПТОВАЛЮТНОГО АКТИВУ'),
        emptyLine(),
        infoRow('Складено', `${now} (UTC+3)`),
        infoRow('Система', 'ODB OSINT Platform (odb-one.vercel.app)'),
        infoRow('Адреса об\'єкта', address),
        infoRow('Мережа (blockchain)', chain.toUpperCase()),
        infoRow('Оцінка ризику (Risk Score)', `${riskScore}/100`),
        infoRow('Вердикт AI', verdict || '—'),
        emptyLine(),

        // Subject
        ...(r.subject ? [
          heading2('1. СУБ\'ЄКТ ДОСЛІДЖЕННЯ'),
          infoRow('Орієнтовна особа', r.subject.estimated_identity || '—'),
          infoRow('Відомі email', (r.subject.known_emails || []).join(', ') || '—'),
          infoRow('Відомі телефони', (r.subject.known_phones || []).join(', ') || '—'),
          infoRow('Орієнтовний обсяг', r.subject.total_volume_usd_approx || '—'),
          emptyLine(),
        ] : []),

        // Wallet summary (w = walletData.wallet або walletData напряму)
        ...(w.balance_native != null || w.tx_count != null ? [
          heading2('2. ПАРАМЕТРИ ГАМАНЦЯ'),
          infoRow('Баланс (native)', `${w.balance_native ?? '—'} ${w.symbol ?? ''}`),
          infoRow('Баланс (USD)',    w.balance_usd != null ? `$${Number(w.balance_usd).toLocaleString()}` : '—'),
          infoRow('Кількість транзакцій', String(w.tx_count ?? w.n_tx ?? '—')),
          infoRow('Перша активність',    w.first_tx    || w.first_seen || '—'),
          infoRow('Остання активність',  w.last_tx     || w.last_seen  || '—'),
          infoRow('Унікальних контрагентів', String(w.unique_counterparties ?? '—')),
          emptyLine(),
        ] : []),

        // Transactions table
        ...(txRows.length ? [
          heading2(`3. ОСТАННІ ТРАНЗАКЦІЇ (${Math.min(txs.length, 20)} шт.)`),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:           { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              bottom:        { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              left:          { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              right:         { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: '555555' },
            },
            rows: txRows,
          }),
          emptyLine(),
        ] : []),

        // Trace table
        ...(traceRows.length ? [
          heading2(`4. АНАЛІЗ ЛАНЦЮГА (ТРАСУВАННЯ — ${traceNodes.length} вузлів)`),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:     { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              bottom:  { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              left:    { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              right:   { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '555555' },
              insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: '555555' },
            },
            rows: traceRows,
          }),
          emptyLine(),
        ] : []),

        // Fraud indicators
        ...(fraudItems.length ? [
          heading2('5. ІНДИКАТОРИ ШАХРАЙСТВА'),
          ...fraudItems,
          emptyLine(),
        ] : []),

        // Executive summary
        ...(r.executive_summary ? [
          heading2('6. ВИСНОВОК'),
          para(r.executive_summary),
          emptyLine(),
        ] : []),

        // Recommendations
        ...(recoItems.length ? [
          heading2('7. РЕКОМЕНДАЦІЇ'),
          ...recoItems,
          emptyLine(),
        ] : []),

        // Timeline
        ...(timelineItems.length ? [
          heading2('8. ХРОНОЛОГІЯ АКТИВНОСТІ'),
          ...timelineItems,
          emptyLine(),
        ] : []),

        // Law enforcement
        ...(r.law_enforcement_notes ? [
          heading2('9. ДЛЯ ПРАВООХОРОННИХ ОРГАНІВ'),
          para(r.law_enforcement_notes),
          emptyLine(),
        ] : []),

        emptyLine(),
        para(`Документ сформовано автоматично системою ODB OSINT Platform о ${now}`, true),
        para('Для використання в якості доказового матеріалу необхідна верифікація аналітиком.'),
      ],
    }],
  })

  return Packer.toBlob(doc)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
