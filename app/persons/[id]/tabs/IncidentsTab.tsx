'use client'

const INCIDENT_TYPES = [
  'обстріл', 'катування', 'вбивство', 'мародерство',
  'зґвалтування', 'депортація', 'unknown',
]

interface IncidentForm {
  title:     string; setTitle:    (v: string) => void
  date:      string; setDate:     (v: string) => void
  location:  string; setLocation: (v: string) => void
  type:      string; setType:     (v: string) => void
  desc:      string; setDesc:     (v: string) => void
  icc:       string; setIcc:      (v: string) => void
  severity:  string; setSeverity: (v: string) => void
  role:      string; setRole:     (v: string) => void
}

interface IncidentsTabProps {
  incidents:        any[]
  incidentsLoading: boolean
  showForm:         boolean
  setShowForm:      (v: boolean) => void
  form:             IncidentForm
  saving:           boolean
  onCreate:         () => void
}

export function IncidentsTab({
  incidents, incidentsLoading, showForm, setShowForm, form, saving, onCreate,
}: IncidentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-gray-300 font-semibold">⚖️ Воєнні злочини: {incidents.length}</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm font-medium transition"
        >
          + Додати інцидент
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--odb-surface)', border: '1px solid rgba(153,27,27,0.6)' }}>
          <h4 className="text-red-400 font-semibold text-sm">Новий інцидент</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-gray-400 text-xs mb-1 block">Назва *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => form.setTitle(e.target.value)}
                placeholder="Короткий опис події"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Дата</label>
              <input
                type="date"
                value={form.date}
                onChange={e => form.setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Тип</label>
              <select
                value={form.type}
                onChange={e => form.setType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              >
                {INCIDENT_TYPES.map(t => (
                  <option key={t} value={t}>{t === 'unknown' ? 'Інше' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Місце</label>
              <input
                type="text"
                value={form.location}
                onChange={e => form.setLocation(e.target.value)}
                placeholder="Місто, координати"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Роль особи</label>
              <select
                value={form.role}
                onChange={e => form.setRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              >
                {['виконавець', 'командир', 'організатор', 'свідок'].map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Тяжкість</label>
              <select
                value={form.severity}
                onChange={e => form.setSeverity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              >
                {[['low','Низька'],['medium','Середня'],['high','Висока'],['critical','Критична']].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Стаття МКС</label>
              <input
                type="text"
                value={form.icc}
                onChange={e => form.setIcc(e.target.value)}
                placeholder="Ст. 8(2)(a)(i)"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
            </div>
            <div className="col-span-2">
              <label className="text-gray-400 text-xs mb-1 block">Опис</label>
              <textarea
                value={form.desc}
                onChange={e => form.setDesc(e.target.value)}
                rows={3}
                placeholder="Детальний опис події..."
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = '#dc2626')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCreate}
              disabled={saving || !form.title.trim()}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-medium transition"
            >
              {saving ? '⏳ Зберігаю...' : '✓ Додати'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {incidentsLoading && (
        <div className="text-center py-8 text-gray-500 animate-pulse">Завантаження...</div>
      )}

      {!incidentsLoading && incidents.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">⚖️</p>
          <p className="text-gray-400">Інцидентів не зафіксовано</p>
        </div>
      )}

      <div className="space-y-3">
        {incidents.map((inc: any) => (
          <div key={inc.id} className="rounded-xl p-5" style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="font-semibold" style={{ color: 'var(--odb-text)' }}>{inc.title}</h4>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {inc.inc_type && (
                    <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">{inc.inc_type}</span>
                  )}
                  {inc.severity && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      inc.severity === 'critical' ? 'bg-red-900 text-red-300'  :
                      inc.severity === 'high'     ? 'bg-orange-900 text-orange-300' :
                      inc.severity === 'medium'   ? 'bg-yellow-900 text-yellow-300' :
                      'bg-gray-700 text-gray-400'
                    }`}>{inc.severity}</span>
                  )}
                  {inc.date && <span className="text-gray-500 text-xs">📅 {inc.date}</span>}
                  {inc.location && <span className="text-gray-500 text-xs">📍 {inc.location}</span>}
                </div>
                {inc.description && (
                  <p className="text-gray-400 text-sm mt-2 leading-relaxed">{inc.description}</p>
                )}
                {inc.icc_article && (
                  <p className="text-yellow-400/70 text-xs mt-2">МКС: {inc.icc_article}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
