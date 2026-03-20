import React from 'react'
import { FileText, Plus, X, Trash2, CheckSquare } from 'lucide-react'
import { generateUUID } from '../../utils/uuid'
import './TemplateEditor.css'

/** 기본 제공 양식 프리셋 */
export const PRESET_TEMPLATES = [
  {
    key: 'todo',
    name: '투두관리',
    icon: CheckSquare,
    sections: [
      { id: 'preset-todo-now', title: '지금 할일', order: 0, fixed: true },
      { id: null, title: '일반 섹션', order: 1 },
    ],
  },
]

/**
 * 양식 선택 다이얼로그
 * 기본 양식 + 사용자 양식 선택 또는 새 양식 만들기
 */
export function TemplatePicker({ templates, onSelect, onSelectPreset, onDelete, onCreateNew, onClose }) {
  return (
    <div className="template-picker-overlay" onClick={onClose}>
      <div className="template-picker" onClick={(e) => e.stopPropagation()}>
        <div className="template-picker-header">
          <h3>양식 선택</h3>
          <button className="template-editor-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="template-picker-list">
          {/* 기본 양식 */}
          <div className="template-picker-section-label">기본 양식</div>
          {PRESET_TEMPLATES.map(preset => {
            const Icon = preset.icon || FileText
            return (
              <button
                key={preset.key}
                className="template-picker-item"
                onClick={() => onSelectPreset(preset)}
              >
                <Icon size={18} />
                <div className="template-picker-item-info">
                  <div className="template-picker-item-name">{preset.name}</div>
                  <div className="template-picker-item-desc">
                    {preset.sections.length}개 섹션
                  </div>
                </div>
              </button>
            )
          })}

          {/* 내 양식 */}
          {templates.length > 0 && (
            <>
              <div className="template-picker-section-label">내 양식</div>
              {templates.map(t => (
                <div key={t.id} className="template-picker-item-row">
                  <button
                    className="template-picker-item"
                    onClick={() => onSelect(t.id)}
                  >
                    <FileText size={18} />
                    <div className="template-picker-item-info">
                      <div className="template-picker-item-name">{t.name}</div>
                      <div className="template-picker-item-desc">
                        {t.sections?.length || 0}개 섹션
                      </div>
                    </div>
                  </button>
                  {onDelete && (
                    <button
                      className="template-picker-item-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`"${t.name}" 양식을 삭제하시겠습니까?`)) {
                          onDelete(t.id)
                        }
                      }}
                      title="양식 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="template-picker-footer">
          <button className="template-picker-new" onClick={onCreateNew}>
            <Plus size={16} />
            <span>새 양식 만들기</span>
          </button>
          <button className="template-save-btn secondary" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
