'use client'

// Shared micro-components reused across multiple tab files

export function Field({ label, value }: { label: string; value: any }) {
  if (!value) return null
  return (
    <div className="mb-3">
      <p className="text-gray-500 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-white mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
      </p>
    </div>
  )
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-gray-300 font-semibold mb-4 pb-2 border-b border-gray-700 text-sm">{title}</h3>
      {children}
    </div>
  )
}

export function SaveAllButton({
  results,
  allRaw,
  onSave,
}: {
  results: any[]
  allRaw: any[]
  onSave: (fields: any, all: any[]) => void
}) {
  function handleSaveAll() {
    const merged: Record<string, any> = {}
    const allPhones: string[] = []
    for (const r of results) {
      const f = r.fields || {}
      for (const k of Object.keys(f)) {
        if (f[k] && !merged[k]) merged[k] = f[k]
      }
      if (Array.isArray(f.phones_list)) allPhones.push(...f.phones_list)
    }
    if (allPhones.length > 0) merged.phones_list = Array.from(new Set(allPhones))
    onSave(merged, allRaw.length > 0 ? allRaw : results)
  }

  const totalRaw  = allRaw.length || results.length
  const filtered  = results.length

  return (
    <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/50 flex items-center justify-between">
      <span className="text-gray-400 text-sm">
        {filtered} релевантних / {totalRaw} всього записів
      </span>
      <button
        onClick={handleSaveAll}
        className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition"
      >
        💾 Зберегти все до досьє
      </button>
    </div>
  )
}
