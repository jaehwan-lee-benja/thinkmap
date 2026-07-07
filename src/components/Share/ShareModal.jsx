import React, { useState } from 'react'
import { UserPlus, Trash2, Users } from 'lucide-react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@thinkmap/core'
import './ShareModal.css'

function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  shares = [],
  onCreateShare,
  onUpdatePermission,
  onDeleteShare,
  isLoading = false,
}) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('viewer')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('이메일을 입력하세요.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setError('올바른 이메일 형식이 아닙니다.')
      return
    }

    const result = await onCreateShare(resourceType, resourceId, email.trim(), permission)

    if (result.success) {
      setEmail('')
      setPermission('viewer')
    } else {
      setError(result.error || '공유 추가에 실패했습니다.')
    }
  }

  const handlePermissionChange = async (shareId, newPermission) => {
    await onUpdatePermission(shareId, newPermission)
  }

  const handleRemoveShare = async (shareId) => {
    if (window.confirm('이 공유를 삭제하시겠습니까?')) {
      await onDeleteShare(shareId)
    }
  }

  const resourceLabel = resourceType === 'project' ? '프로젝트' : '페이지'

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="share-modal">
      <ModalHeader icon={Users} title={`${resourceLabel} 공유`} onClose={onClose} />

      {/* 리소스 이름 */}
      <div className="share-modal-resource">
        <span className="share-resource-label">{resourceLabel}:</span>
        <span className="share-resource-name">{resourceName}</span>
      </div>

      {/* 공유 추가 폼 */}
      <form className="share-form" onSubmit={handleSubmit}>
        <div className="share-form-row">
          <input
            type="email"
            className="share-email-input"
            placeholder="이메일 주소 입력"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          <select
            className="share-permission-select"
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            disabled={isLoading}
          >
            <option value="viewer">뷰어</option>
            <option value="editor">편집자</option>
          </select>
          <button type="submit" className="share-add-button" disabled={isLoading}>
            <UserPlus size={18} />
            추가
          </button>
        </div>
        {error && <div className="share-error">{error}</div>}
      </form>

      {/* 공유된 사용자 목록 */}
      <ModalBody>
        <div className="share-list">
          <div className="share-list-header">공유된 사용자</div>
          {shares.length === 0 ? (
            <div className="share-list-empty">아직 공유된 사용자가 없습니다.</div>
          ) : (
            <div className="share-list-items">
              {shares.map((share) => (
                <div key={share.id} className="share-item">
                  <div className="share-item-info">
                    <span className="share-item-email">{share.shared_with_email}</span>
                    {share.shared_with_user_id ? (
                      <span className="share-item-status active">가입됨</span>
                    ) : (
                      <span className="share-item-status pending">대기중</span>
                    )}
                  </div>
                  <div className="share-item-actions">
                    <select
                      className="share-item-permission"
                      value={share.permission}
                      onChange={(e) => handlePermissionChange(share.id, e.target.value)}
                    >
                      <option value="viewer">뷰어</option>
                      <option value="editor">편집자</option>
                    </select>
                    <button
                      className="share-item-remove"
                      onClick={() => handleRemoveShare(share.id)}
                      title="공유 삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <p><strong>뷰어:</strong> 내용을 볼 수만 있습니다.</p>
        <p><strong>편집자:</strong> 내용을 수정할 수 있습니다.</p>
      </ModalFooter>
    </Modal>
  )
}

export default ShareModal
