import { useState, useCallback } from 'react'

/**
 * 인라인 이름 수정 훅
 * @param {Function} onSave - 저장 콜백 (id, newValue) => void
 * @returns {Object} 편집 상태 및 핸들러
 */
export function useEditableField(onSave) {
  const [editingId, setEditingId] = useState(null)
  const [editingValue, setEditingValue] = useState('')

  const startEdit = useCallback((id, currentValue) => {
    setEditingId(id)
    setEditingValue(currentValue)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingValue('')
  }, [])

  const saveEdit = useCallback(() => {
    if (editingId && editingValue.trim()) {
      onSave(editingId, editingValue.trim())
    }
    setEditingId(null)
    setEditingValue('')
  }, [editingId, editingValue, onSave])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') saveEdit()
    else if (e.key === 'Escape') cancelEdit()
  }, [saveEdit, cancelEdit])

  const isEditing = useCallback((id) => editingId === id, [editingId])

  return {
    editingId,
    editingValue,
    setEditingValue,
    startEdit,
    cancelEdit,
    saveEdit,
    handleKeyDown,
    isEditing,
  }
}
