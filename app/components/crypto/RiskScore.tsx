'use client'

interface Props {
  score: number  // 0–100
  label?: string
}

export default function RiskScore({ score, label }: Props) {
  const clamped = Math.max(0, Math.min(100, score))

  const color =
    clamped > 75 ? { bar: 'bg-red-500',    text: 'text-red-400',    ring: 'border-red-800/50',    bg: 'bg-red-950/20',    name: 'Критичний' } :
    clamped > 40 ? { bar: 'bg-orange-500', text: 'text-orange-400', ring: 'border-orange-800/40', bg: 'bg-orange-950/20', name: 'Середній'  } :
                   { bar: 'bg-green-500',  text: 'text-green-400',  ring: 'border-green-800/40',  bg: 'bg-green-950/20',  name: 'Низький'   }

  return (
    <div className={`rounded-xl border p-4 ${color.bg} ${color.ring}`}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">AML Risk Score</p>
          <p className={`text-5xl font-black font-mono leading-none ${color.text}`}>{clamped}</p>
          <p className="text-gray-400 text-xs mt-1 font-mono">/100</p>
        </div>
        <div className={`text-right`}>
          <p className={`text-sm font-bold uppercase ${color.text}`}>{label || color.name}</p>
          <p className="text-gray-600 text-xs mt-0.5">
            {clamped > 75 ? 'Санкції / Даркнет' :
             clamped > 40 ? 'Дроп / Міксер'    : 'Чиста активність'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
        <div
          className={`${color.bar} h-full rounded-full transition-all duration-700`}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {/* Ticks */}
      <div className="flex justify-between mt-1 px-0.5">
        {[0, 25, 50, 75, 100].map(v => (
          <span key={v} className="text-gray-700 text-xs font-mono">{v}</span>
        ))}
      </div>
    </div>
  )
}
