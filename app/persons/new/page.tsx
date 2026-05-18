'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import Sidebar from '../../components/Sidebar'

const SECTION = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
    <h3 className="text-gray-300 font-semibold text-sm pb-2 border-b border-gray-700">{title}</h3>
    {children}
  </div>
)

const Field = ({
  label, name, value, onChange, placeholder = '', type = 'text', required = false
}: {
  label: string; name: string; value: string; onChange: (e: any) => void
  placeholder?: string; type?: string; required?: boolean
}) => (
  <div>
    <label className="block text-gray-500 text-xs uppercase tracking-wide mb-1">
      {label}{required && <span className="text-red-400 ml-1">*</span>}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none placeholder-gray-600"
    />
  </div>
)

const SelectField = ({
  label, name, value, onChange, options, required = false
}: {
  label: string; name: string; value: string; onChange: (e: any) => void
  options: { value: string; label: string }[]; required?: boolean
}) => (
  <div>
    <label className="block text-gray-500 text-xs uppercase tracking-wide mb-1">
      {label}{required && <span className="text-red-400 ml-1">*</span>}
    </label>
    <select
      name={name}
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="">— не вказано —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
)

export default function AddPersonPage() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [phones, setPhones] = useState([''])
  const [tags, setTags] = useState('')

  const [form, setForm] = useState({
    // ПІБ
    name_ukr: '', name_rus: '', name_eng: '',
    // Особисті дані
    dob: '', gender: '', birth_place: '', nationality: 'RU', region: '',
    // Військова служба
    rank: '', position: '', unit: '', unit_num: '', military_id: '',
    // Документи
    ipn: '', passport: '', snils: '',
    // Контакти
    email: '', addr_live: '', addr_reg: '',
    // Аналітика
    threat_level: 'unknown', status: 'фігурант', priority: '',
    icc_relevant: false, verified: false,
    // Нотатки
    notes: '', analyst_notes: '', sources: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function addPhone() { setPhones(prev => [...prev, '']) }
  function removePhone(i: number) { setPhones(prev => prev.filter((_, idx) => idx !== i)) }
  function updatePhone(i: number, val: string) {
    setPhones(prev => { const n = [...prev]; n[i] = val; return n })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name_ukr && !form.name_rus) {
      setError('Вкажіть хоча б одне ім\'я (українською або російською)')
      return
    }
    setSaving(true)
    setError('')

    try {
      const cleanPhones = phones.filter(p => p.trim().length > 0)
      const cleanTags = tags.split(',').map(t => t.trim()).filter(Boolean)

      const payload = {
        ...form,
        phones: cleanPhones.length > 0 ? cleanPhones : null,
        tags: cleanTags.length > 0 ? cleanTags : null,
        name: form.name_ukr || form.name_rus,
      }

      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        router.push(`/persons/${data.id}`)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4 shrink-0">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm">← Назад</button>
          <h1 className="text-lg font-bold">➕ Додати особу до бази</h1>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-4">

            {error && (
              <div className="bg-red-950 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
                ❌ {error}
              </div>
            )}

            {/* ПІБ */}
            <SECTION title="👤 Повне ім'я">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="ПІБ (українською)" name="name_ukr" value={form.name_ukr} onChange={handleChange}
                  placeholder="Іваненко Іван Іванович" />
                <Field label="ФІО (російською)" name="name_rus" value={form.name_rus} onChange={handleChange}
                  placeholder="Иванов Иван Иванович" />
                <Field label="Full name (English)" name="name_eng" value={form.name_eng} onChange={handleChange}
                  placeholder="Ivanov Ivan Ivanovich" />
              </div>
            </SECTION>

            {/* Особисті дані */}
            <SECTION title="📋 Особисті дані">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Дата народження" name="dob" value={form.dob} onChange={handleChange}
                  placeholder="ДД.ММ.РРРР" />
                <SelectField label="Стать" name="gender" value={form.gender} onChange={handleChange}
                  options={[{ value: 'М', label: 'Чоловіча' }, { value: 'Ж', label: 'Жіноча' }]} />
                <Field label="Місце народження" name="birth_place" value={form.birth_place} onChange={handleChange}
                  placeholder="м. Москва" />
                <Field label="Громадянство" name="nationality" value={form.nationality} onChange={handleChange}
                  placeholder="RU" />
                <Field label="Регіон" name="region" value={form.region} onChange={handleChange}
                  placeholder="25 ОА / Свердловська обл." />
              </div>
            </SECTION>

            {/* Військова служба */}
            <SECTION title="🎖️ Військова служба">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Звання" name="rank" value={form.rank} onChange={handleChange}
                  placeholder="Старший лейтенант" />
                <Field label="Посада" name="position" value={form.position} onChange={handleChange}
                  placeholder="Командир взводу" />
                <Field label="Підрозділ" name="unit" value={form.unit} onChange={handleChange}
                  placeholder="Войскова частина 12322" />
                <Field label="Номер в/ч" name="unit_num" value={form.unit_num} onChange={handleChange}
                  placeholder="X-278104" />
                <Field label="Військовий ID" name="military_id" value={form.military_id} onChange={handleChange}
                  placeholder="УА-12345" />
              </div>
            </SECTION>

            {/* Документи */}
            <SECTION title="📄 Документи">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="ІПН" name="ipn" value={form.ipn} onChange={handleChange}
                  placeholder="1234567890" />
                <Field label="Паспорт" name="passport" value={form.passport} onChange={handleChange}
                  placeholder="АА 123456" />
                <Field label="СНІЛС" name="snils" value={form.snils} onChange={handleChange}
                  placeholder="123-456-789 01" />
              </div>
            </SECTION>

            {/* Контакти */}
            <SECTION title="📞 Контакти">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange}
                  placeholder="example@mail.ru" />
                <Field label="Адреса проживання" name="addr_live" value={form.addr_live} onChange={handleChange}
                  placeholder="м. Москва, вул. ..." />
                <Field label="Адреса реєстрації" name="addr_reg" value={form.addr_reg} onChange={handleChange}
                  placeholder="м. Єкатеринбург, вул. ..." />
              </div>

              {/* Телефони */}
              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-wide mb-2">Телефони</label>
                <div className="space-y-2">
                  {phones.map((phone, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={phone}
                        onChange={e => updatePhone(i, e.target.value)}
                        placeholder="+7 912 345 67 89"
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none font-mono"
                      />
                      {phones.length > 1 && (
                        <button type="button" onClick={() => removePhone(i)}
                          className="px-3 py-2 bg-red-950 hover:bg-red-900 text-red-400 rounded-lg text-sm transition">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addPhone}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded-lg text-xs transition">
                    + Додати телефон
                  </button>
                </div>
              </div>
            </SECTION>

            {/* Аналітика */}
            <SECTION title="📊 Аналітика та класифікація">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SelectField label="Рівень загрози" name="threat_level" value={form.threat_level} onChange={handleChange}
                  options={[
                    { value: 'high', label: '🔴 Висока' },
                    { value: 'medium', label: '🟡 Середня' },
                    { value: 'low', label: '🟢 Низька' },
                    { value: 'unknown', label: '⚪ Невідома' },
                  ]} />
                <SelectField label="Статус" name="status" value={form.status} onChange={handleChange}
                  options={[
                    { value: 'фігурант', label: 'Фігурант' },
                    { value: 'підозрюваний', label: 'Підозрюваний' },
                    { value: 'затриманий', label: 'Затриманий' },
                    { value: 'загиблий', label: 'Загиблий' },
                    { value: 'в розшуку', label: 'В розшуку' },
                  ]} />
                <SelectField label="Пріоритет" name="priority" value={form.priority} onChange={handleChange}
                  options={[
                    { value: '1', label: '1 — Критичний' },
                    { value: '2', label: '2 — Високий' },
                    { value: '3', label: '3 — Середній' },
                    { value: '4', label: '4 — Низький' },
                  ]} />
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wide mb-2">Теги (через кому)</label>
                  <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                    placeholder="25 ОА, ЗС РФ, МКС"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="icc_relevant" checked={form.icc_relevant as boolean}
                    onChange={handleChange} className="w-4 h-4 accent-blue-500" />
                  <span className="text-gray-300 text-sm">МКС релевантний</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="verified" checked={form.verified as boolean}
                    onChange={handleChange} className="w-4 h-4 accent-green-500" />
                  <span className="text-gray-300 text-sm">Верифіковано</span>
                </label>
              </div>
            </SECTION>

            {/* Нотатки */}
            <SECTION title="📝 Нотатки та джерела">
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wide mb-1">Загальні нотатки</label>
                  <textarea name="notes" value={form.notes} onChange={handleChange} rows={3}
                    placeholder="Загальна інформація про особу..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wide mb-1">Аналітичні нотатки</label>
                  <textarea name="analyst_notes" value={form.analyst_notes} onChange={handleChange} rows={3}
                    placeholder="Аналіз зв'язків, діяльності..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-wide mb-1">Джерела</label>
                  <input type="text" name="sources" value={form.sources} onChange={handleChange}
                    placeholder="Telegram, VK, відкриті реєстри..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </SECTION>

            {/* Submit */}
            <div className="flex gap-3 pt-2 pb-8">
              <button type="submit" disabled={saving}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 rounded-xl font-medium transition flex items-center gap-2">
                {saving ? <><span className="animate-spin">⟳</span> Збереження...</> : <>💾 Зберегти до бази</>}
              </button>
              <button type="button" onClick={() => router.back()}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition">
                Скасувати
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  )
}
