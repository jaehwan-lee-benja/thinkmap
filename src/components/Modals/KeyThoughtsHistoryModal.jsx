// 블록 트리를 재귀적으로 렌더링하는 헬퍼 함수
function renderBlockTree(blocks, depth = 0) {
  if (!Array.isArray(blocks)) return null

  return blocks.map((block, idx) => (
    <div key={idx} style={{ marginLeft: `${depth * 16}px`, marginBottom: '4px' }}>
      <div>
        {block.type === 'toggle' ? '▸ ' : ''}{block.content || '(빈 블록)'}
      </div>
      {block.children && block.children.length > 0 && renderBlockTree(block.children, depth + 1)}
    </div>
  ))
}

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
            <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '20px' }}>
              저장된 버전이 없습니다.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {keyThoughtsHistory.map((version) => (
                <div
                  key={version.id}
                  style={{
                    border: '1px solid var(--color-border-medium)',
                    borderRadius: 'var(--border-radius-xl)',
                    padding: '16px',
                    backgroundColor: 'var(--color-bg-input)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        {new Date(version.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          timeZone: 'Asia/Seoul'
                        })}
                      </div>
                      {version.description && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                          {version.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onRestoreVersion(version.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--color-success)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--border-radius-md)',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      복구
                    </button>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--color-text-secondary)',
                    maxHeight: '100px',
                    overflowY: 'auto',
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: '8px',
                    borderRadius: 'var(--border-radius-md)',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {/* 블록 내용 미리보기 */}
                    {version.action === 'manual_snapshot' && Array.isArray(version.content_after) ? (
                      // 수동 스냅샷: 전체 블록 트리 표시
                      renderBlockTree(version.content_after, 0)
                    ) : version.content_after ? (
                      // 개별 블록 수정: content_after만 표시
                      <div>{version.content_after}</div>
                    ) : (
                      '(내용 없음)'
                    )}
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
