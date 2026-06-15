'use client'

import EvidenceUploader from '../../../components/EvidenceUploader'
import { openWayback, openGoogleCache } from '../utils/person-utils'

interface DocumentsTabProps {
  personId:  string
  osintPdfs: any[]
}

export function DocumentsTab({ personId, osintPdfs }: DocumentsTabProps) {
  return (
    <div className="space-y-6">
      {osintPdfs.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: 'var(--odb-surface)', border: '1px solid rgba(126,34,206,0.5)' }}>
          <h3 className="text-purple-400 font-semibold mb-4 text-sm">
            🔍 PDF знайдені через OSINT ({osintPdfs.length})
          </h3>
          <div className="space-y-3">
            {osintPdfs.map((pdf: any, i: number) => (
              <div key={i} className="rounded-lg p-4" style={{ background: 'var(--odb-surface2)', border: '1px solid var(--odb-border)' }}>
                <p className="text-blue-400 font-medium text-sm">{pdf.title}</p>
                <p className="text-gray-600 text-xs mt-1 truncate">{pdf.link}</p>
                {pdf.snippet && <p className="text-gray-400 text-sm mt-2">{pdf.snippet}</p>}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openWayback(pdf.link)}
                    className="px-3 py-1 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded text-xs transition"
                  >
                    📦 Wayback
                  </button>
                  <button
                    onClick={() => openGoogleCache(pdf.link)}
                    className="px-3 py-1 bg-green-900 hover:bg-green-800 text-green-300 rounded text-xs transition"
                  >
                    🔍 Google Cache
                  </button>
                  <a
                    href={pdf.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded text-xs transition"
                    style={{ background: 'var(--odb-surface3)', color: 'var(--odb-text-dim)', border: '1px solid var(--odb-border)' }}
                  >
                    🔗 Оригінал
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <EvidenceUploader personId={personId} />
    </div>
  )
}
