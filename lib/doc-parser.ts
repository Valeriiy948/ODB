// lib/doc-parser.ts — Витягування тексту з PDF, DOCX, XLSX

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/pdf') {
      return await parsePDF(buffer)
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await parseDOCX(buffer)
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return await parseXLSX(buffer)
    }
    return ''
  } catch (e) {
    console.error('doc-parser error:', e)
    return ''
  }
}

async function parsePDF(buf: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string }>
  const data = await pdfParse(buf, { max: 0 })
  return data.text?.replace(/\r\n/g, '\n').trim() ?? ''
}

async function parseDOCX(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer: buf })
  return value?.trim() ?? ''
}

async function parseXLSX(buf: Buffer): Promise<string> {
  const XLSX = await import('xlsx')
  const wb   = XLSX.read(buf, { type: 'buffer' })
  const lines: string[] = []
  for (const name of wb.SheetNames) {
    lines.push(`=== ${name} ===`)
    const sheet = wb.Sheets[name]
    const csv   = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    lines.push(csv)
  }
  return lines.join('\n').trim()
}
