// app/api/face-search/route.ts
// Серверний proxy до FaceCheck.ID — ключ ніколи не потрапляє на клієнт

import { NextRequest, NextResponse } from 'next/server'

const FACECHECK_BASE = 'https://facecheck.id'
const TOKEN = process.env.FACECHECK_API_TOKEN

export interface FaceResult {
  score:  number
  url:    string
  base64: string
}

// ─── POST /api/face-search ───────────────────────────────────────────────────
// Body: { url: string }  — пошук по публічному URL фото
//    або multipart з полем "image" — upload файлу
//
// Повертає: { results: FaceResult[] } або { error: string }

export async function POST(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json(
      { error: 'FACECHECK_API_TOKEN не налаштований. Додайте змінну в Vercel.' },
      { status: 503 }
    )
  }

  const contentType = req.headers.get('content-type') || ''
  let imageBlob: Blob
  let filename = 'photo.jpg'

  try {
    if (contentType.includes('multipart/form-data')) {
      // Upload файлу з браузера
      const form = await req.formData()
      const file = form.get('image')
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'Поле image відсутнє' }, { status: 400 })
      }
      imageBlob = file
      filename = file.name || filename
    } else {
      // URL фото (для кнопки на person page)
      const { url } = await req.json() as { url: string }
      if (!url?.startsWith('http')) {
        return NextResponse.json({ error: 'Невалідний URL' }, { status: 400 })
      }
      const imgRes = await fetch(url, { signal: AbortSignal.timeout(8_000) })
      if (!imgRes.ok) return NextResponse.json({ error: 'Не вдалось завантажити фото' }, { status: 400 })
      imageBlob = await imgRes.blob()
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
      filename = `photo.${ext}`
    }
  } catch (e) {
    return NextResponse.json({ error: `Помилка підготовки зображення: ${String(e)}` }, { status: 400 })
  }

  // ── 1. Upload до FaceCheck ──────────────────────────────────────────────
  let idSearch: string
  try {
    const uploadForm = new FormData()
    uploadForm.append('image', imageBlob, filename)

    const uploadRes = await fetch(`${FACECHECK_BASE}/api/upload_pic`, {
      method: 'POST',
      headers: { Authorization: TOKEN },
      body: uploadForm,
      signal: AbortSignal.timeout(15_000),
    })
    const uploadData = await uploadRes.json() as { id_search?: string; error?: string }
    if (!uploadRes.ok || !uploadData.id_search) {
      return NextResponse.json(
        { error: uploadData.error || `Upload failed: ${uploadRes.status}` },
        { status: 502 }
      )
    }
    idSearch = uploadData.id_search
  } catch (e) {
    return NextResponse.json({ error: `Upload error: ${String(e)}` }, { status: 502 })
  }

  // ── 2. Polling (max 30s, кроки по 3s) ──────────────────────────────────
  const DEMO = !TOKEN || TOKEN === 'demo'
  const maxAttempts = 10

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 3_000))

    try {
      const searchRes = await fetch(`${FACECHECK_BASE}/api/search`, {
        method: 'POST',
        headers: {
          Authorization: TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id_search: idSearch, demo: DEMO, status_only: attempt < maxAttempts - 1 }),
        signal: AbortSignal.timeout(10_000),
      })

      const searchData = await searchRes.json() as {
        output?: { items?: FaceResult[] }
        error?: string
        message?: string
      }

      if (searchData.error) {
        return NextResponse.json({ error: searchData.error }, { status: 502 })
      }

      if (searchData.output?.items) {
        const results: FaceResult[] = searchData.output.items.map(item => ({
          score:  item.score,
          url:    item.url,
          base64: item.base64 ?? '',
        }))
        return NextResponse.json({ results, id_search: idSearch })
      }

      // status_only відповідь — ще обробляється
    } catch {
      // timeout на цій спробі — продовжуємо
    }
  }

  return NextResponse.json(
    { error: 'Тайм-аут: FaceCheck не відповів за 30 секунд. Спробуйте ще раз.' },
    { status: 504 }
  )
}
