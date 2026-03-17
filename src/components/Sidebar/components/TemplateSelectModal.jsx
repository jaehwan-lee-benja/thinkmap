import React, { useState, useRef, useEffect } from 'react'
import { Modal } from '../../Common/Modal/Modal'
import { PAGE_TEMPLATES } from '../../../utils/pageTemplates'
import './TemplateSelectModal.css'

/**
 * 페이지 생성 시 양식 선택 모달
 * - 페이지 이름 입력
 * - 양식(템플릿) 선택
 */
export function TemplateSelectModal({ isOpen, onClose, onConfirm }) {
  const [selectedId, setSelectedId] = useState('blank')
  const [pageName, setPageName] = useState('')
  const inputRef = useRef(null)

  // 모달 열릴 때 초기화 + 포커스
  useEffect(() => {
    if (isOpen) {
      setSelectedId('blank')
      setPageName('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 선택된 템플릿이 바뀌면 기본 이름 반영
  useEffect(() => {
    if (!isOpen) return
    const tmpl = PAGE_TEMPLATES.find(t => t.id === selectedId)
    if (tmpl?.getDefaultName && !pageName.trim()) {
      setPageName(tmpl.getDefaultName())
    }
  }, [selectedId])

  const handleConfirm = () => {
    const tmpl = PAGE_TEMPLATES.find(t => t.id === selectedId)
    const name = pageName.trim() || tmpl?.getDefaultName?.() || 'Untitled'
    onConfirm(name, tmpl)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="template-select-modal">
      <div className="template-modal-header">
        <span className="template-modal-title">새 페이지</span>
      </div>

      {/* 페이지 이름 */}
      <div className="template-name-section">
        <input
          ref={inputRef}
          type="text"
          className="template-name-input"
          placeholder="페이지 이름"
          value={pageName}
          onChange={(e) => setPageName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* 양식 선택 */}
      <div className="template-label">양식 선택</div>
      <div className="template-grid">
        {PAGE_TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            className={`template-card ${selectedId === tmpl.id ? 'selected' : ''}`}
            onClick={() => setSelectedId(tmpl.id)}
          >
            <span className="template-card-icon">{tmpl.icon}</span>
            <span className="template-card-name">{tmpl.name}</span>
            <span className="template-card-desc">{tmpl.description}</span>
          </button>
        ))}
      </div>

      {/* 확인 버튼 */}
      <div className="template-actions">
        <button className="template-cancel-btn" onClick={onClose}>취소</button>
        <button className="template-confirm-btn" onClick={handleConfirm}>생성</button>
      </div>
    </Modal>
  )
}
