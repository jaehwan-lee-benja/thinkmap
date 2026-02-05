import React, { useState, useEffect } from 'react'
import { X, Clock, Download, Upload, Trash2, RotateCcw, Plus, HardDrive } from 'lucide-react'
import './BackupModal.css'

/**
 * 백업 모달 - 타임머신 스타일
 */
function BackupModal({
  isOpen,
  onClose,
  project,
  pages,
  backups,
  isLoading,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onExportBackup,
  onImportBackup,
  onRefresh,
}) {
  const [description, setDescription] = useState('')
  const [selectedBackup, setSelectedBackup] = useState(null)

  useEffect(() => {
    if (isOpen) {
      onRefresh?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  // 백업 생성
  const handleCreateBackup = async () => {
    if (isLoading) return

    const result = await onCreateBackup(description)
    if (result) {
      setDescription('')
      onRefresh?.()
    }
  }

  // 복원
  const handleRestore = async (backup) => {
    if (isLoading) return

    const confirmed = window.confirm(
      `"${backup.description}" 백업으로 복원하시겠습니까?\n\n현재 프로젝트의 모든 내용이 이 백업 시점으로 되돌아갑니다.\n이 작업은 취소할 수 없습니다.`
    )

    if (confirmed) {
      const success = await onRestoreBackup(backup.id)
      if (success) {
        alert('복원이 완료되었습니다. 페이지를 새로고침합니다.')
        window.location.reload()
      }
    }
  }

  // 삭제
  const handleDelete = (backup, e) => {
    e.stopPropagation()
    if (window.confirm(`"${backup.description}" 백업을 삭제하시겠습니까?`)) {
      onDeleteBackup(backup.id)
      onRefresh?.()
    }
  }

  // 내보내기
  const handleExport = (backup, e) => {
    e.stopPropagation()
    onExportBackup(backup)
  }

  // 가져오기
  const handleImport = async () => {
    const result = await onImportBackup()
    if (result) {
      onRefresh?.()
    }
  }

  // 상대적 시간 포맷
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '방금 전'
    if (diffMins < 60) return `${diffMins}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`

    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // 전체 시간 포맷
  const formatFullTime = (dateString) => {
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="backup-modal-overlay" onClick={onClose}>
      <div className="backup-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="backup-modal-header">
          <div className="backup-modal-title">
            <HardDrive size={20} />
            <span>프로젝트 백업</span>
          </div>
          <button className="backup-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 프로젝트 정보 */}
        <div className="backup-project-info">
          <span className="backup-project-label">프로젝트:</span>
          <span className="backup-project-name">{project?.name}</span>
          <span className="backup-page-count">{pages?.length || 0}개 페이지</span>
        </div>

        {/* 새 백업 생성 */}
        <div className="backup-create-section">
          <div className="backup-create-form">
            <input
              type="text"
              className="backup-description-input"
              placeholder="백업 설명 (선택사항)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBackup()
              }}
              disabled={isLoading}
            />
            <button
              className="backup-create-button"
              onClick={handleCreateBackup}
              disabled={isLoading}
            >
              <Plus size={18} />
              <span>백업 생성</span>
            </button>
          </div>
          <button
            className="backup-import-button"
            onClick={handleImport}
            disabled={isLoading}
          >
            <Upload size={16} />
            <span>파일에서 가져오기</span>
          </button>
        </div>

        {/* 백업 타임라인 */}
        <div className="backup-timeline-section">
          <div className="backup-timeline-header">
            <Clock size={16} />
            <span>백업 히스토리</span>
            <span className="backup-count">{backups?.length || 0}개</span>
          </div>

          {(!backups || backups.length === 0) ? (
            <div className="backup-empty">
              <HardDrive size={40} className="backup-empty-icon" />
              <p>아직 백업이 없습니다.</p>
              <p className="backup-empty-hint">위의 "백업 생성" 버튼을 눌러 첫 번째 백업을 만드세요.</p>
            </div>
          ) : (
            <div className="backup-timeline">
              {backups.map((backup, index) => (
                <div
                  key={backup.id}
                  className={`backup-item ${selectedBackup?.id === backup.id ? 'selected' : ''}`}
                  onClick={() => setSelectedBackup(backup)}
                >
                  <div className="backup-item-timeline">
                    <div className="backup-item-dot" />
                    {index < backups.length - 1 && <div className="backup-item-line" />}
                  </div>

                  <div className="backup-item-content">
                    <div className="backup-item-header">
                      <span className="backup-item-time">{formatRelativeTime(backup.createdAt)}</span>
                      <div className="backup-item-actions">
                        <button
                          className="backup-action-btn"
                          onClick={(e) => handleExport(backup, e)}
                          title="파일로 내보내기"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="backup-action-btn delete"
                          onClick={(e) => handleDelete(backup, e)}
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="backup-item-description">
                      {backup.description}
                    </div>

                    <div className="backup-item-meta">
                      <span>{formatFullTime(backup.createdAt)}</span>
                      <span>{backup.pages?.length || 0}개 페이지</span>
                    </div>

                    <button
                      className="backup-restore-button"
                      onClick={() => handleRestore(backup)}
                      disabled={isLoading}
                    >
                      <RotateCcw size={14} />
                      <span>이 시점으로 복원</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 안내 */}
        <div className="backup-info">
          <p>백업은 브라우저에 저장되며, 최대 10개까지 유지됩니다.</p>
          <p>중요한 백업은 "파일로 내보내기"로 안전하게 보관하세요.</p>
        </div>

        {/* 로딩 오버레이 */}
        {isLoading && (
          <div className="backup-loading-overlay">
            <div className="backup-loading-spinner" />
            <span>처리 중...</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default BackupModal
