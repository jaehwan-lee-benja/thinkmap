function KeyThoughtsHistoryModal({
  showKeyThoughtsHistory,
  onClose,
  keyThoughtsHistory,
  onRestoreVersion
}) {
  if (!showKeyThoughtsHistory) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh' }}>
        <div className="modal-header">
          <h2>🕐 주요 생각정리 버전 히스토리</h2>
          <button onClick={onClose} className="modal-close-button">✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {keyThoughtsHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
              저장된 버전이 없습니다.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {keyThoughtsHistory.map((version) => (
                <div
                  key={version.id}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: '#f9f9f9'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {new Date(version.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </div>
                      {version.description && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                          {version.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onRestoreVersion(version.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      복구
                    </button>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    maxHeight: '100px',
                    overflowY: 'auto',
                    backgroundColor: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {/* 블록 내용 미리보기 */}
                    {Array.isArray(version.content) ?
                      version.content.map((block, idx) => (
                        <div key={idx} style={{ marginBottom: '4px' }}>
                          {block.type === 'toggle' ? '▸ ' : ''}{block.content || '(빈 블록)'}
                        </div>
                      ))
                      : '(내용 없음)'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default KeyThoughtsHistoryModal
