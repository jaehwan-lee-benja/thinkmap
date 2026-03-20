import React, { useState, useCallback, useRef, useEffect } from 'react'
import { GripVertical, Plus, X, FileText } from 'lucide-react'
import { generateUUID } from '../../utils/uuid'
import './TemplateEditor.css'

/**
 * 양식 편집 모드 컴포넌트
 * 섹션 추가/삭제/순서변경/이름변경 + 저장 옵션
 */
export function TemplateEditor({
  templateName: initialName,
  sections: initialSections,
  isNew,
  pageId,
  templateId,
  onSave,
  onCancel,
}) {
  const [name, setName] = useState(initialName || '')
  const [sections, setSections] = useState(
    initialSections?.length > 0
      ? initialSections.map((s, i) => ({ ...s, order: s.order ?? i }))
      : [{ id: generateUUID(), title: '섹션 1', order: 0 }]
  )
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  const newSectionRef = useRef(null)

  // 섹션 추가
  const addSection = useCallback(() => {
    const newSection = {
      id: generateUUID(),
      title: `섹션 ${sections.length + 1}`,
      order: sections.length,
    }
    setSections(prev => [...prev, newSection])
    // 추가 후 포커스
    setTimeout(() => newSectionRef.current?.focus(), 50)
  }, [sections.length])

  // 섹션 삭제
  const removeSection = useCallback((sectionId) => {
    if (sections.length <= 1) return
    setSections(prev =>
      prev.filter(s => s.id !== sectionId).map((s, i) => ({ ...s, order: i }))
    )
  }, [sections.length])

  // 섹션 제목 변경
  const renameSection = useCallback((sectionId, newTitle) => {
    setSections(prev =>
      prev.map(s => s.id === sectionId ? { ...s, title: newTitle } : s)
    )
  }, [])

  // 드래그 순서 변경
  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex !== null && index !== dragIndex) {
      setDropIndex(index)
    }
  }

  const handleDrop = (e, index) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setSections(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next.map((s, i) => ({ ...s, order: i }))
    })
    setDragIndex(null)
    setDropIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDropIndex(null)
  }

  // 저장 핸들러
  const handleSave = (mode) => {
    const trimmedName = name.trim() || '새 양식'
    const cleanSections = sections.map((s, i) => ({
      id: s.id,
      title: s.title.trim() || `섹션 ${i + 1}`,
      order: i,
    }))
    onSave({ name: trimmedName, sections: cleanSections, mode })
  }

  return (
    <div className="template-editor-overlay">
      <div className="template-editor">
        <div className="template-editor-header">
          <h3>양식 편집</h3>
          <button className="template-editor-close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="template-editor-body">
          {/* 양식 이름 */}
          <div className="template-editor-name">
            <label>양식 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 업무일지, 회의록..."
              autoFocus
            />
          </div>

          {/* 섹션 목록 */}
          <div className="template-editor-sections">
            <label>섹션 구성</label>
            {sections.map((section, index) => (
              <div
                key={section.id}
                className={`template-section-item ${dragIndex === index ? 'dragging' : ''} ${dropIndex === index ? 'drop-target' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div className="template-section-handle" title="드래그하여 순서 변경">
                  <GripVertical size={16} />
                </div>
                <FileText size={14} className="template-section-icon" />
                <input
                  ref={index === sections.length - 1 ? newSectionRef : null}
                  type="text"
                  className="template-section-title"
                  value={section.title}
                  onChange={(e) => renameSection(section.id, e.target.value)}
                  placeholder="섹션 이름"
                />
                <button
                  className="template-section-remove"
                  onClick={() => removeSection(section.id)}
                  disabled={sections.length <= 1}
                  title={sections.length <= 1 ? '최소 1개 섹션 필요' : '섹션 삭제'}
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            <button className="template-section-add" onClick={addSection}>
              <Plus size={16} />
              <span>섹션 추가</span>
            </button>
          </div>
        </div>

        {/* 저장 옵션 */}
        <div className="template-editor-footer">
          {isNew ? (
            <>
              <button className="template-save-btn secondary" onClick={onCancel}>
                취소
              </button>
              <button className="template-save-btn primary" onClick={() => handleSave('create')}>
                양식 생성
              </button>
            </>
          ) : (
            <>
              <button className="template-save-btn secondary" onClick={onCancel}>
                취소
              </button>
              <div className="template-save-options">
                <button
                  className="template-save-btn"
                  onClick={() => handleSave('applyToAll')}
                  title="이 양식을 사용하는 모든 페이지에 반영"
                >
                  전체 적용
                </button>
                <button
                  className="template-save-btn"
                  onClick={() => handleSave('applyToThisOnly')}
                  title="이 페이지만 양식 구조 변경"
                >
                  이 페이지만
                </button>
                <button
                  className="template-save-btn primary"
                  onClick={() => handleSave('applyFromNowOn')}
                  title="이 페이지 + 앞으로 이 양식으로 만드는 페이지에 반영"
                >
                  이후부터 적용
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
