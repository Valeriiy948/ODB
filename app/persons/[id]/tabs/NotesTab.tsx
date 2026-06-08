'use client'

import { Card } from './shared'

interface NotesTabProps {
  notes:        string | null | undefined
  analystNotes: string | null | undefined
  sources:      string | null | undefined
}

export function NotesTab({ notes, analystNotes, sources }: NotesTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="📝 Загальні нотатки">
          {notes
            ? <p className="text-gray-300 text-sm whitespace-pre-wrap">{notes}</p>
            : <p className="text-gray-600 text-sm">Нотатки відсутні</p>}
        </Card>
        <Card title="🔬 Аналітичні нотатки">
          {analystNotes
            ? <p className="text-gray-300 text-sm whitespace-pre-wrap">{analystNotes}</p>
            : <p className="text-gray-600 text-sm">Аналітичні нотатки відсутні</p>}
        </Card>
      </div>
      {(sources) && (
        <Card title="📎 Джерела">
          <p className="text-gray-300 text-sm">{sources}</p>
        </Card>
      )}
    </div>
  )
}
