'use client'

interface RegistriesTabProps {
  personName:     string
  regLoading:     boolean
  regAutoRan:     boolean
  regNazk:        any
  regMyrotvorets: any
  regErb:         any
  regMvs:         any
  regSanctions:   any
  regCompany:     any
  onRefresh:      () => void
}

export function RegistriesTab({
  personName, regLoading, regAutoRan,
  regNazk, regMyrotvorets, regErb, regMvs, regSanctions, regCompany,
  onRefresh,
}: RegistriesTabProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">🏛️ Перевірка по реєстрах</h3>
          <p className="text-gray-500 text-xs mt-0.5">НАЗК · Миротворець · ЄРБ · МВС Розшук · OpenSanctions · ЄДР/ФОП</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={regLoading}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center gap-2"
        >
          {regLoading ? <><span className="animate-spin">⟳</span> Перевірка...</> : '🔄 Оновити'}
        </button>
      </div>

      {/* Summary grid */}
      {regAutoRan && !regLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: '📜', label: 'НАЗК декл.',  value: regNazk?.found || 0,       total: regNazk?.total, color: regNazk?.found > 0 ? 'yellow' : 'gray' },
            { icon: '🚨', label: 'Миротворець', value: regMyrotvorets?.found || 0,                        color: regMyrotvorets?.found > 0 ? 'red' : 'gray' },
            { icon: '💳', label: 'ЄРБ боржники',value: regErb?.found || 0,                               color: regErb?.found > 0 ? 'orange' : 'gray' },
            { icon: '🚔', label: 'МВС Розшук',  value: regMvs?.total || 0,                               color: regMvs?.total > 0 ? 'red' : (regMvs?.fallback_url ? 'yellow' : 'gray') },
            { icon: '🌍', label: 'Санкції',      value: regSanctions?.total || 0,                         color: regSanctions?.total > 0 ? 'red' : 'gray' },
            { icon: '🏢', label: 'ЄДР/ФОП',     value: regCompany?.total || 0,                           color: regCompany?.total > 0 ? 'blue' : 'gray' },
          ].map(({ icon, label, value, total, color }) => (
            <div key={label} className={`rounded-xl p-4 border text-center ${
              color === 'red'    ? 'bg-red-950/50 border-red-700'      :
              color === 'orange' ? 'bg-orange-950/50 border-orange-700' :
              color === 'yellow' ? 'bg-yellow-950/50 border-yellow-700' :
              color === 'blue'   ? 'bg-blue-950/50 border-blue-700'    :
              'bg-gray-800 border-gray-700'
            }`}>
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`text-2xl font-bold ${color === 'gray' ? 'text-gray-400' : 'text-white'}`}>
                {value}{total && total > value ? <span className="text-sm text-gray-400">/{total}</span> : ''}
              </div>
              <div className="text-gray-400 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* НАЗК */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
          <h4 className="text-yellow-400 font-semibold text-sm">📜 НАЗК — Декларації держслужбовців</h4>
          {regNazk?.total > 0 && (
            <a href={`https://public.nazk.gov.ua/search?query=${encodeURIComponent(personName)}`}
              target="_blank" rel="noopener noreferrer" className="text-yellow-600 hover:text-yellow-400 text-xs">
              Відкрити на НАЗК →
            </a>
          )}
        </div>
        {!regAutoRan && !regLoading && <p className="text-gray-600 text-sm italic">Буде перевірено автоматично при завантаженні</p>}
        {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка НАЗК...</p>}
        {regNazk && !regLoading && (
          regNazk.found === 0
            ? <p className="text-gray-500 text-sm italic">Декларацій не знайдено</p>
            : <div className="space-y-2">
                <p className="text-yellow-300/80 text-xs mb-2">Знайдено {regNazk.total} декларацій, показано {regNazk.declarations?.length}</p>
                {regNazk.declarations?.map((d: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-yellow-950/20 border border-yellow-800/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{d.full_name || d.last_name}</p>
                        <p className="text-yellow-300/70 text-xs mt-0.5">{d.position} · {d.organization}</p>
                        <p className="text-gray-500 text-xs">{d.declaration_type} · {d.declaration_year}</p>
                      </div>
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 px-2 py-1 bg-yellow-900/50 hover:bg-yellow-800/60 text-yellow-300 text-xs rounded transition">
                        Відкрити →
                      </a>
                    </div>
                    {regNazk.latest?.id === d.id && regNazk.latest?.assets && (
                      <div className="mt-2 pt-2 border-t border-yellow-900/50 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {regNazk.latest.assets.real_estate?.length > 0 && <span className="text-gray-300">🏠 Нерухомість: {regNazk.latest.assets.real_estate.length} об'єктів</span>}
                        {regNazk.latest.assets.vehicles?.length > 0 && <span className="text-gray-300">🚗 Авто: {regNazk.latest.assets.vehicles.length} шт</span>}
                        {regNazk.latest.assets.total_income_uah > 0 && <span className="text-gray-300">💰 Дохід: {(regNazk.latest.assets.total_income_uah / 1000).toFixed(0)}k грн</span>}
                        {regNazk.latest.assets.cash?.length > 0 && <span className="text-gray-300">💵 Готівка: {regNazk.latest.assets.cash.map((c: any) => `${c.amount?.toLocaleString()} ${c.currency}`).join(', ')}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
        )}
      </div>

      {/* Миротворець */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
          <h4 className="text-red-400 font-semibold text-sm">🚨 Миротворець</h4>
          {regMyrotvorets?.found > 0 && (
            <a href={`https://myrotvorets.center/?s=${encodeURIComponent(personName)}`}
              target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-300 text-xs">
              Відкрити на сайті →
            </a>
          )}
        </div>
        {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка Миротворця...</p>}
        {regMyrotvorets && !regLoading && (
          regMyrotvorets.found === 0
            ? <p className="text-green-600 text-sm">✅ У базі Миротворця не знайдено</p>
            : <div className="space-y-2">
                <p className="text-red-400/80 text-xs mb-2">⚠️ Знайдено {regMyrotvorets.found} записів</p>
                {regMyrotvorets.results?.map((r: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-red-950/20 border border-red-800/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{r.title}</p>
                        {r.excerpt && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{r.excerpt}</p>}
                        <p className="text-gray-600 text-xs mt-1">{r.date}</p>
                      </div>
                      <a href={r.url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 px-2 py-1 bg-red-900/50 hover:bg-red-800/60 text-red-300 text-xs rounded transition">
                        Відкрити →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
        )}
      </div>

      {/* ЄРБ */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
          <h4 className="text-orange-400 font-semibold text-sm">💳 ЄРБ — Реєстр боржників</h4>
          {regErb?.fallback_url && (
            <a href={regErb.fallback_url} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-300 text-xs">
              Перевірити вручну →
            </a>
          )}
        </div>
        {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка ЄРБ...</p>}
        {regErb && !regLoading && (
          regErb.found === 0
            ? <p className="text-green-600 text-sm">✅ Боргів не знайдено{regErb.fallback_url ? ' (або захист від ботів)' : ''}</p>
            : <div className="space-y-2">
                <p className="text-orange-400/80 text-xs mb-2">Знайдено {regErb.found} записів про борги</p>
                {regErb.debtors?.map((d: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-orange-950/20 border border-orange-800/30 text-sm">
                    <p className="text-white font-medium">{d.lastName} {d.firstName} {d.middleName}</p>
                    {d.birthDate && <p className="text-gray-400 text-xs">ДН: {d.birthDate}</p>}
                    {d.debtSum && <p className="text-orange-300 text-xs">Борг: {d.debtSum?.toLocaleString()} грн</p>}
                    {d.creditorName && <p className="text-gray-400 text-xs">Стягувач: {d.creditorName}</p>}
                  </div>
                ))}
              </div>
        )}
      </div>

      {/* МВС */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
          <h4 className="text-blue-400 font-semibold text-sm">🚔 МВС — Розшук</h4>
          {regMvs?.fallback_url && (
            <a href={regMvs.fallback_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-300 text-xs">
              Перевірити на сайті →
            </a>
          )}
        </div>
        {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка МВС...</p>}
        {regMvs && !regLoading && (
          regMvs.fallback_url && regMvs.total === 0
            ? <div>
                <p className="text-gray-500 text-sm mb-2">OpenData МВС тимчасово недоступний. Перевірте вручну:</p>
                <a href={regMvs.fallback_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 rounded-lg text-sm transition">
                  🚔 Відкрити МВС Розшук
                </a>
              </div>
            : regMvs.total === 0
              ? <p className="text-green-600 text-sm">✅ В розшуку МВС не значиться</p>
              : <div className="space-y-2">
                  <p className="text-red-400/80 text-xs mb-2">⚠️ Знайдено {regMvs.total} записів у розшуку</p>
                  {regMvs.records?.map((r: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 text-sm">
                      <p className="text-white font-medium">{r.LAST_NAME_U || r.lastname} {r.FIRST_NAME_U || r.firstname}</p>
                      {(r.BORN_DATE || r.dob) && <p className="text-gray-400 text-xs">ДН: {r.BORN_DATE || r.dob}</p>}
                      {(r.ARTICLE_CRIM || r.article) && <p className="text-red-400 text-xs">Стаття: {r.ARTICLE_CRIM || r.article}</p>}
                    </div>
                  ))}
                </div>
        )}
      </div>

      {/* OpenSanctions */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
          <div>
            <h4 className="text-red-400 font-semibold text-sm">🌍 Міжнародні санкційні списки</h4>
            <p className="text-gray-600 text-xs mt-0.5">OFAC (США) · EU · ООН РБ · UK HMT · РНБО України · Інтерпол · Panama Papers</p>
          </div>
          <a href={`https://www.opensanctions.org/search/?q=${encodeURIComponent(personName)}`}
            target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-300 text-xs shrink-0">
            OpenSanctions →
          </a>
        </div>
        {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка санкційних баз...</p>}
        {regSanctions && !regLoading && (
          regSanctions.no_key
            ? <div className="space-y-3">
                <p className="text-yellow-500 text-sm">⚠️ API ключ OpenSanctions не налаштовано. Перевірте вручну:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(regSanctions.fallback_urls || {}).map(([k, url]: any) => (
                    <a key={k} href={url} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-red-900/30 hover:bg-red-800/50 text-red-300 text-xs rounded-lg border border-red-800/40 transition">
                      🔗 {k.toUpperCase()}
                    </a>
                  ))}
                </div>
              </div>
            : regSanctions.error
            ? <p className="text-red-500 text-sm">❌ Помилка: {regSanctions.error}</p>
            : regSanctions.total === 0
              ? <p className="text-green-600 text-sm">✅ У санкційних списках не знайдено</p>
              : <div className="space-y-3">
                  <p className="text-red-400/80 text-xs mb-2">⚠️ Знайдено {regSanctions.total} збігів</p>
                  {(regSanctions.entries || []).slice(0, 8).map((e: any, i: number) => (
                    <div key={i} className={`p-3 rounded-lg border text-sm ${e.is_priority ? 'bg-red-950/30 border-red-700/50' : 'bg-gray-900 border-gray-700'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-semibold">{e.name}</p>
                            {e.is_priority && <span className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">🇷🇺 Росія/Білорусь</span>}
                          </div>
                          {e.aliases?.length > 0 && <p className="text-gray-400 text-xs mt-0.5">Alias: {e.aliases.join(', ')}</p>}
                          {e.dob && <p className="text-gray-500 text-xs">ДН: {e.dob}</p>}
                          {e.programs?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {e.programs.slice(0, 5).map((p: string, pi: number) => (
                                <span key={pi} className="text-xs bg-red-900/60 text-red-300 border border-red-800/40 px-1.5 py-0.5 rounded">{p}</span>
                              ))}
                              {e.programs.length > 5 && <span className="text-xs text-gray-500">+{e.programs.length - 5} ще</span>}
                            </div>
                          )}
                        </div>
                        <a href={e.url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 px-2 py-1 bg-red-900/50 hover:bg-red-800/60 text-red-300 text-xs rounded transition">
                          Деталі →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
        )}
        {!regAutoRan && !regLoading && <p className="text-gray-600 text-sm italic">Буде перевірено автоматично при завантаженні</p>}
      </div>

      {/* ЄДР / Бізнес */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
          <div>
            <h4 className="text-blue-400 font-semibold text-sm">🏢 Бізнес-реєстри (ЄДР · ФОП · YouControl)</h4>
            <p className="text-gray-600 text-xs mt-0.5">Компанії, ФОП, де особа є директором або засновником</p>
          </div>
          <a href={`https://youcontrol.com.ua/search/?q=${encodeURIComponent(personName)}`}
            target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-300 text-xs shrink-0">
            YouControl →
          </a>
        </div>
        {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Пошук у бізнес-реєстрах...</p>}
        {regCompany && !regLoading && (
          regCompany.error
            ? <p className="text-red-500 text-sm">❌ {regCompany.error}</p>
            : (regCompany.companies || []).filter((c: any) => c.type !== 'fallback').length === 0
              ? <div>
                  <p className="text-gray-500 text-sm mb-2">Компаній не знайдено у відкритих реєстрах. Перевірте вручну:</p>
                  <div className="flex flex-wrap gap-2">
                    {(regCompany.companies || []).filter((c: any) => c.type === 'fallback').map((c: any, i: number) => (
                      <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs rounded-lg transition">
                        🔗 {c.name}
                      </a>
                    ))}
                    {[
                      [`https://clarity-project.info/person/?search=${encodeURIComponent(personName)}`, 'Clarity Project'],
                      [`https://prozorro.gov.ua/search/?mode=_all_&q=${encodeURIComponent(personName)}`, 'Prozorro тендери'],
                    ].map(([href, label]) => (
                      <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs rounded-lg transition">
                        🔗 {label}
                      </a>
                    ))}
                  </div>
                </div>
              : <div className="space-y-2">
                  <p className="text-blue-400/80 text-xs mb-2">Знайдено {(regCompany.companies || []).filter((c: any) => c.type !== 'fallback').length} компаній/ФОП</p>
                  {(regCompany.companies || []).filter((c: any) => c.type !== 'fallback').slice(0, 10).map((c: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-medium">{c.name}</p>
                            {c.type === 'fop' && <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">ФОП</span>}
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              c.status?.toLowerCase().includes('зареєстр') ? 'bg-green-900 text-green-400' :
                              c.status?.toLowerCase().includes('припин') || c.status?.toLowerCase().includes('ліквід') ? 'bg-red-900/50 text-red-400' :
                              'bg-gray-700 text-gray-400'
                            }`}>{c.status || 'Статус невідомий'}</span>
                          </div>
                          {c.edrpou && <p className="text-gray-500 text-xs">ЄДРПОУ: {c.edrpou}</p>}
                          {c.director && <p className="text-gray-400 text-xs">Директор: {c.director}</p>}
                          {c.address && <p className="text-gray-600 text-xs truncate">{c.address}</p>}
                        </div>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 px-2 py-1 bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 text-xs rounded transition">→</a>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex flex-wrap gap-2">
                    {[
                      [`https://prozorro.gov.ua/search/?mode=_all_&q=${encodeURIComponent(personName)}`, 'Prozorro тендери'],
                      [`https://clarity-project.info/person/?search=${encodeURIComponent(personName)}`, 'Clarity Project'],
                      [`https://opendatabot.ua/search?q=${encodeURIComponent(personName)}`, 'Opendatabot'],
                    ].map(([href, label]) => (
                      <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition">
                        🔗 {label}
                      </a>
                    ))}
                  </div>
                </div>
        )}
        {!regAutoRan && !regLoading && <p className="text-gray-600 text-sm italic">Буде перевірено автоматично при завантаженні</p>}
      </div>
    </div>
  )
}
